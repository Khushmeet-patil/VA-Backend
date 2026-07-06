import redisClient from '../config/redis';
import Astrologer from '../models/Astrologer';
import ChatSession from '../models/ChatSession';
import CallSession from '../models/CallSession';
import availabilityService from './availabilityService';
import { Server as SocketIOServer } from 'socket.io';
import * as admin from 'firebase-admin';

class HeartbeatService {
    private io: SocketIOServer | null = null;
    private localHeartbeats: Map<string, number> = new Map();
    private monitorInterval: NodeJS.Timeout | null = null;
    private pingPromises: Map<string, (received: boolean) => void> = new Map();

    /**
     * Initialize the heartbeat service and start the background monitor
     */
    initialize(io: SocketIOServer) {
        this.io = io;
        this.startMonitor();
        console.log('[HeartbeatService] Initialized presence monitor.');
    }

    /**
     * Register a heartbeat event for an astrologer
     */
    async registerHeartbeat(userId: string): Promise<void> {
        const now = Date.now();
        // 1. Update local memory map
        this.localHeartbeats.set(userId, now);

        // 2. Update Redis client with a 120-second TTL
        try {
            await redisClient.set(`heartbeat:astrologer:${userId}`, now.toString(), 'EX', 120);
        } catch (err: any) {
            console.error(`[HeartbeatService] Redis write error for astrologer ${userId}:`, err.message);
        }
    }

    /**
     * Retrieve the last heartbeat timestamp for an astrologer
     */
    async getLastHeartbeat(userId: string): Promise<number | null> {
        // Try reading from Redis first to support multi-process environments (PM2 cluster)
        try {
            const val = await redisClient.get(`heartbeat:astrologer:${userId}`);
            if (val) {
                return parseInt(val, 10);
            }
        } catch (err: any) {
            console.error(`[HeartbeatService] Redis read error for astrologer ${userId}:`, err.message);
        }

        // Fallback to local process memory
        return this.localHeartbeats.get(userId) || null;
    }

    /**
     * Remove the heartbeat tracking data (used on manual offline or logout)
     */
    async removeHeartbeat(userId: string): Promise<void> {
        this.localHeartbeats.delete(userId);
        try {
            await redisClient.del(`heartbeat:astrologer:${userId}`);
        } catch (err: any) {
            console.error(`[HeartbeatService] Redis delete error for astrologer ${userId}:`, err.message);
        }
    }

    /**
     * Send a silent high-priority data message to ping the device
     */
    private async sendSilentPing(fcmToken: string, userId: string): Promise<boolean> {
        try {
            const message: admin.messaging.Message = {
                token: fcmToken,
                data: {
                    type: 'ping',
                    astrologerId: userId,
                    timestamp: Date.now().toString()
                },
                android: {
                    priority: 'high',
                    ttl: 15 * 1000 // 15 seconds TTL
                },
                apns: {
                    headers: {
                        'apns-priority': '10',
                    },
                    payload: {
                        aps: {
                            'content-available': 1,
                        },
                    },
                },
            };

            await admin.messaging().send(message);
            return true;
        } catch (error: any) {
            console.error(`[HeartbeatService] Error sending silent FCM ping to astrologer ${userId}:`, error.message);
            return false;
        }
    }

    /**
     * Ping the device and wait up to 6 seconds for a response from the background handler
     */
    async pingDevice(userId: string, fcmToken: string): Promise<boolean> {
        return new Promise<boolean>(async (resolve) => {
            const timeout = setTimeout(() => {
                this.pingPromises.delete(userId);
                resolve(false); // No response, likely network is offline
            }, 6000); // 6 seconds timeout

            this.pingPromises.set(userId, (received: boolean) => {
                clearTimeout(timeout);
                this.pingPromises.delete(userId);
                resolve(received);
            });

            const sent = await this.sendSilentPing(fcmToken, userId);
            if (!sent) {
                clearTimeout(timeout);
                this.pingPromises.delete(userId);
                resolve(false);
            }
        });
    }

    /**
     * Resolve a pending ping promise when the client responds via REST endpoint
     */
    resolvePing(userId: string) {
        const cb = this.pingPromises.get(userId);
        if (cb) {
            cb(true);
        }
    }

    /**
     * Start the background presence scanning interval
     */
    startMonitor() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
        }

        // Run background monitor every 15 seconds as specified
        this.monitorInterval = setInterval(async () => {
            try {
                await this.monitorOnlineAstrologers();
            } catch (err: any) {
                console.error('[HeartbeatService] Error in presence scan:', err.message);
            }
        }, 15000);
    }

    /**
     * Scan all online astrologers and check for heartbeat timeouts
     */
    async monitorOnlineAstrologers(): Promise<void> {
        if (!this.io) return;

        // Fetch all astrologers currently marked online in database
        const onlineAstros = await Astrologer.find({ isOnline: true });
        if (onlineAstros.length === 0) return;

        const now = Date.now();

        for (const astro of onlineAstros) {
            const userId = astro._id.toString();
            const lastHeartbeat = await this.getLastHeartbeat(userId);

            // If no heartbeat has ever been registered, or it is older than 60 seconds
            if (!lastHeartbeat || (now - lastHeartbeat > 60000)) {
                // If they have an FCM token, double check if their device is connected to the internet.
                // If the device is connected to the internet (even if the app is killed), it will receive the high-priority
                // silent FCM ping and respond back. If they respond, we keep them online.
                if (astro.fcmToken) {
                    console.log(`[HeartbeatService] Astrologer ${astro.firstName} (${userId}) heartbeat expired. Pinging device via FCM...`);
                    const isReachable = await this.pingDevice(userId, astro.fcmToken);
                    if (isReachable) {
                        console.log(`[HeartbeatService] Astrologer ${astro.firstName} (${userId}) device responded to FCM ping. Device has internet. Keeping online.`);
                        // Register a fresh heartbeat so we don't spam pings on every monitor cycle
                        await this.registerHeartbeat(userId);
                        continue;
                    }
                    console.log(`[HeartbeatService] Astrologer ${astro.firstName} (${userId}) device did NOT respond to FCM ping within timeout. Assuming internet is offline.`);
                } else {
                    console.log(`[HeartbeatService] Astrologer ${astro.firstName} (${userId}) has no FCM token. Cannot verify internet status.`);
                }

                console.log(`[HeartbeatService] Astrologer ${astro.firstName} (${userId}) exceeded 60s heartbeat limit. Running presence safety checks...`);

                // Check 1: Verify there is no active socket connection in their room
                const roomName = `astrologer:${userId}`;
                const room = this.io.sockets.adapter.rooms.get(roomName);
                if (room && room.size > 0) {
                    console.log(`[HeartbeatService] Safety Guard Passed: Active socket connection found for ${userId} (${room.size} sockets). Keeping online.`);
                    continue;
                }

                // Check 2: Double check recent heartbeat in case of race/delay
                const freshHeartbeat = await this.getLastHeartbeat(userId);
                if (freshHeartbeat && (now - freshHeartbeat <= 60000)) {
                    console.log(`[HeartbeatService] Safety Guard Passed: Fresh heartbeat received during execution. Keeping online.`);
                    continue;
                }

                // Check 3: Verify there is no active chat session
                const activeChat = await ChatSession.findOne({ astrologerId: userId, status: 'ACTIVE' });
                if (activeChat) {
                    console.log(`[HeartbeatService] Safety Guard Passed: Astrologer ${astro.firstName} is in an ACTIVE chat. Keeping online.`);
                    continue;
                }

                // Check 4: Verify there is no active voice call
                const activeVoiceCall = await CallSession.findOne({ 
                    astrologerId: userId, 
                    status: 'ACTIVE', 
                    sessionType: 'voice_call' 
                });
                if (activeVoiceCall) {
                    console.log(`[HeartbeatService] Safety Guard Passed: Astrologer ${astro.firstName} is in an ACTIVE voice call. Keeping online.`);
                    continue;
                }

                // Check 5: Verify there is no active video call
                const activeVideoCall = await CallSession.findOne({ 
                    astrologerId: userId, 
                    status: 'ACTIVE', 
                    sessionType: 'video_call' 
                });
                if (activeVideoCall) {
                    console.log(`[HeartbeatService] Safety Guard Passed: Astrologer ${astro.firstName} is in an ACTIVE video call. Keeping online.`);
                    continue;
                }

                // Check 6: Verify there is no active live stream
                if (astro.isCurrentlyLive === true) {
                    console.log(`[HeartbeatService] Safety Guard Passed: Astrologer ${astro.firstName} is currently LIVE streaming. Keeping online.`);
                    continue;
                }

                // Only if all safety guards fail: mark offline
                console.log(`[HeartbeatService] All safety guards failed for astrologer ${astro.firstName} (${userId}). Transitioning to OFFLINE.`);
                
                await Astrologer.findByIdAndUpdate(userId, { 
                    $set: { isOnline: false, isManualOverride: true } 
                });
                await availabilityService.recordOffline(userId);

                // Broadcast availability change to clients
                this.io.to(roomName).emit('ASTROLOGER_STATUS_UPDATED', { isOnline: false });
                
                // Clear the cached heartbeat
                await this.removeHeartbeat(userId);
            }
        }
    }

    /**
     * Stop the background presence scanning interval
     */
    stopMonitor() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
    }
}

export const heartbeatService = new HeartbeatService();
export default heartbeatService;

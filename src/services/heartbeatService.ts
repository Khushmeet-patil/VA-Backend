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
            }, 45000); // 45 seconds timeout (increased to handle push delivery latency)

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
     * Restore online status if they were forced offline due to network loss
     */
    async restoreOnlineStatus(userId: string): Promise<void> {
        try {
            const astro = await Astrologer.findById(userId);
            if (!astro) return;

            if (astro.isNetworkOffline) {
                console.log(`[HeartbeatService] Restoring online status for ${astro.firstName} (${userId}) after network recovery...`);

                let shouldRestoreOnline = false;

                if (astro.isManualOverride) {
                    // Manually toggled online previously
                    shouldRestoreOnline = true;
                } else if (astro.isAutoOnlineEnabled) {
                    // Check if they are within their scheduled time
                    const nowUTC = new Date();
                    const istOffset = 5.5 * 60 * 60 * 1000;
                    const now = new Date(nowUTC.getTime() + istOffset);
                    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const currentDay = days[now.getUTCDay()];
                    const hours = now.getUTCHours().toString().padStart(2, '0');
                    const minutes = now.getUTCMinutes().toString().padStart(2, '0');
                    const currentMins = parseInt(hours) * 60 + parseInt(minutes);

                    const todaySchedule = astro.availabilitySchedule.find(s => s.day === currentDay);
                    if (todaySchedule && todaySchedule.enabled) {
                        const startMins = parseInt(todaySchedule.startTime.split(':')[0]) * 60 + parseInt(todaySchedule.startTime.split(':')[1]);
                        const endMins = parseInt(todaySchedule.endTime.split(':')[0]) * 60 + parseInt(todaySchedule.endTime.split(':')[1]);
                        const chatEnabled = astro.isChatEnabled !== false;
                        const voiceEnabled = astro.isVoiceCallEnabled !== false;
                        const videoEnabled = astro.isVideoCallEnabled !== false;

                        shouldRestoreOnline = (currentMins >= startMins && currentMins < endMins) && (chatEnabled || voiceEnabled || videoEnabled);
                    }
                }

                if (shouldRestoreOnline) {
                    console.log(`[HeartbeatService] Restoring ${astro.firstName} (${userId}) to ONLINE status.`);
                    await Astrologer.findByIdAndUpdate(userId, {
                        $set: { isOnline: true, isNetworkOffline: false }
                    });
                    await availabilityService.recordOnline(userId);
                    await this.registerHeartbeat(userId);

                    if (this.io) {
                        const roomName = `astrologer:${userId}`;
                        this.io.to(roomName).emit('ASTROLOGER_STATUS_UPDATED', { isOnline: true });
                    }
                } else {
                    console.log(`[HeartbeatService] Clearing network offline flag for ${astro.firstName} (${userId}) but keeping offline (outside schedule/preference).`);
                    await Astrologer.findByIdAndUpdate(userId, {
                        $set: { isNetworkOffline: false }
                    });
                }
            }
        } catch (error: any) {
            console.error(`[HeartbeatService] Error restoring online status for ${userId}:`, error.message);
        }
    }

    /**
     * Start the background presence scanning interval
     */
    startMonitor() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
        }

        // Run background monitor every 10 minutes (600,000 milliseconds)
        this.monitorInterval = setInterval(async () => {
            try {
                await this.monitorOnlineAstrologers();
            } catch (err: any) {
                console.error('[HeartbeatService] Error in presence scan:', err.message);
            }
        }, 10 * 60 * 1000);
    }

    /**
     * Scan all online astrologers and check reachability
     */
    async monitorOnlineAstrologers(): Promise<void> {
        if (!this.io) return;

        // Fetch all astrologers currently marked online in database
        const onlineAstros = await Astrologer.find({ isOnline: true });
        if (onlineAstros.length === 0) return;

        console.log(`[HeartbeatService] Starting 10-minute presence check for ${onlineAstros.length} online astrologer(s)...`);

        for (const astro of onlineAstros) {
            const userId = astro._id.toString();

            // Check 1: Verify there is no active chat session
            const activeChat = await ChatSession.findOne({ astrologerId: userId, status: 'ACTIVE' });
            if (activeChat) {
                console.log(`[HeartbeatService] Safety Guard Passed: Astrologer ${astro.firstName} (${userId}) is in an ACTIVE chat. Keeping online.`);
                continue;
            }

            // Check 2: Verify there is no active voice call
            const activeVoiceCall = await CallSession.findOne({ 
                astrologerId: userId, 
                status: 'ACTIVE', 
                sessionType: 'voice_call' 
            });
            if (activeVoiceCall) {
                console.log(`[HeartbeatService] Safety Guard Passed: Astrologer ${astro.firstName} (${userId}) is in an ACTIVE voice call. Keeping online.`);
                continue;
            }

            // Check 3: Verify there is no active video call
            const activeVideoCall = await CallSession.findOne({ 
                astrologerId: userId, 
                status: 'ACTIVE', 
                sessionType: 'video_call' 
            });
            if (activeVideoCall) {
                console.log(`[HeartbeatService] Safety Guard Passed: Astrologer ${astro.firstName} (${userId}) is in an ACTIVE video call. Keeping online.`);
                continue;
            }

            // Check 4: Verify there is no active live stream
            if (astro.isCurrentlyLive === true) {
                console.log(`[HeartbeatService] Safety Guard Passed: Astrologer ${astro.firstName} (${userId}) is currently LIVE streaming. Keeping online.`);
                continue;
            }

            // Check 5: Verify if they have an active socket connection
            const roomName = `astrologer:${userId}`;
            const room = this.io.sockets.adapter.rooms.get(roomName);
            if (room && room.size > 0) {
                console.log(`[HeartbeatService] Safety Guard Passed: Active socket connection found for ${astro.firstName} (${userId}) (${room.size} sockets). Keeping online.`);
                continue;
            }

            // Check 6: If they are not active on socket, send an FCM ping to check if they have internet connection
            if (astro.fcmToken) {
                console.log(`[HeartbeatService] Astrologer ${astro.firstName} (${userId}) socket is offline. Pinging device via FCM...`);
                const isReachable = await this.pingDevice(userId, astro.fcmToken);
                if (isReachable) {
                    console.log(`[HeartbeatService] Astrologer ${astro.firstName} (${userId}) device responded to FCM ping. Keeping online.`);
                    // Register a fresh heartbeat so we track they responded
                    await this.registerHeartbeat(userId);
                    continue;
                }
                console.log(`[HeartbeatService] Astrologer ${astro.firstName} (${userId}) device did NOT respond to FCM ping within timeout.`);
            } else {
                console.log(`[HeartbeatService] Astrologer ${astro.firstName} (${userId}) has no FCM token. Cannot verify internet status.`);
            }

            // Only if all safety guards fail: mark offline (intended status is still online, so set isNetworkOffline: true)
            console.log(`[HeartbeatService] All safety guards failed for astrologer ${astro.firstName} (${userId}). Transitioning to OFFLINE due to network loss.`);
            
            await Astrologer.findByIdAndUpdate(userId, { 
                $set: { isOnline: false, isNetworkOffline: true } 
            });
            await availabilityService.recordOffline(userId);

            // Broadcast availability change to clients
            this.io.to(roomName).emit('ASTROLOGER_STATUS_UPDATED', { isOnline: false });
            
            // Clear the cached heartbeat
            await this.removeHeartbeat(userId);
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

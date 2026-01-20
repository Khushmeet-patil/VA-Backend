import * as admin from 'firebase-admin';
import User from '../models/User';
import Astrologer from '../models/Astrologer';

/**
 * NotificationService - Firebase Cloud Messaging handler
 * 
 * Handles push notifications for:
 * - Chat message notifications (when recipient is not on chat screen)
 * - High-priority chat request notifications (call-like UI for astrologers)
 * 
 * Uses environment variables for Railway deployment compatibility.
 */
class NotificationService {
    private initialized = false;

    /**
     * Initialize Firebase Admin SDK using environment variables
     * This approach is compatible with Railway deployment where file uploads aren't supported
     */
    initialize(): void {
        if (this.initialized) {
            console.log('[NotificationService] Already initialized');
            return;
        }

        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        // Handle both escaped \\n and actual newlines in private key
        let privateKey = process.env.FIREBASE_PRIVATE_KEY;
        if (privateKey) {
            privateKey = privateKey.replace(/\\n/g, '\n');
        }

        // Debug logging to help identify issues
        console.log('[NotificationService] Checking Firebase credentials...');
        console.log(`[NotificationService] FIREBASE_PROJECT_ID: ${projectId ? 'SET' : 'MISSING'}`);
        console.log(`[NotificationService] FIREBASE_CLIENT_EMAIL: ${clientEmail ? 'SET' : 'MISSING'}`);
        console.log(`[NotificationService] FIREBASE_PRIVATE_KEY: ${privateKey ? `SET (${privateKey.length} chars)` : 'MISSING'}`);

        if (!projectId || !clientEmail || !privateKey) {
            console.warn('[NotificationService] Firebase credentials not configured. Push notifications disabled.');
            console.warn('[NotificationService] Required env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
            return;
        }

        try {
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert({
                        projectId,
                        clientEmail,
                        privateKey,
                    } as admin.ServiceAccount),
                });
            }

            this.initialized = true;
            console.log('[NotificationService] Firebase Admin initialized successfully');
        } catch (error) {
            console.error('[NotificationService] Failed to initialize Firebase Admin:', error);
        }
    }

    /**
     * Check if notification service is ready
     */
    isReady(): boolean {
        return this.initialized;
    }

    /**
     * Send notification to a user by userId
     */
    async sendToUser(
        userId: string,
        notification: { title: string; body: string },
        data?: Record<string, string>
    ): Promise<boolean> {
        if (!this.initialized) {
            console.warn('[NotificationService] Not initialized, skipping notification');
            return false;
        }

        try {
            const user = await User.findById(userId);
            if (!user?.fcmToken) {
                console.log(`[NotificationService] User ${userId} has no FCM token`);
                return false;
            }

            return await this.sendNotification(user.fcmToken, notification, data);
        } catch (error) {
            console.error('[NotificationService] Error sending to user:', error);
            return false;
        }
    }

    /**
     * Send notification to an astrologer by astrologerId
     */
    async sendToAstrologer(
        astrologerId: string,
        notification: { title: string; body: string },
        data?: Record<string, string>
    ): Promise<boolean> {
        if (!this.initialized) {
            console.warn('[NotificationService] Not initialized, skipping notification');
            return false;
        }

        try {
            const astrologer = await Astrologer.findById(astrologerId);
            if (!astrologer?.fcmToken) {
                console.log(`[NotificationService] Astrologer ${astrologerId} has no FCM token`);
                return false;
            }

            return await this.sendNotification(astrologer.fcmToken, notification, data);
        } catch (error) {
            console.error('[NotificationService] Error sending to astrologer:', error);
            return false;
        }
    }

    /**
     * Send a chat message notification
     * Used when recipient is not actively viewing the chat screen
     */
    async sendChatMessageNotification(
        recipientId: string,
        recipientType: 'user' | 'astrologer',
        senderName: string,
        messageText: string,
        sessionId: string,
        astrologerId?: string,
        astrologerName?: string
    ): Promise<boolean> {
        const notification = {
            title: senderName,
            body: messageText.length > 100 ? messageText.substring(0, 97) + '...' : messageText,
        };

        const data: Record<string, string> = {
            type: 'chat_message',
            sessionId,
            senderName,
            click_action: 'OPEN_CHAT',
        };

        // Add extra data for user app navigation
        if (astrologerId) data.astrologerId = astrologerId;
        if (astrologerName) data.astrologerName = astrologerName;

        if (recipientType === 'user') {
            return await this.sendToUser(recipientId, notification, data);
        } else {
            return await this.sendToAstrologer(recipientId, notification, data);
        }
    }

    /**
     * Send a high-priority chat request notification
     * This creates an "incoming call" style notification for astrologers
     */
    async sendHighPriorityChatRequest(
        astrologerId: string,
        request: {
            sessionId: string;
            userId: string;
            userName: string;
            userMobile?: string;
            ratePerMinute: number;
            intakeDetails?: any;
        }
    ): Promise<boolean> {
        if (!this.initialized) {
            console.warn('[NotificationService] Not initialized, skipping high-priority notification');
            return false;
        }

        try {
            const astrologer = await Astrologer.findById(astrologerId);
            if (!astrologer?.fcmToken) {
                console.log(`[NotificationService] Astrologer ${astrologerId} has no FCM token for high-priority request`);
                return false;
            }

            // IMPORTANT: Data-only message (no notification field)
            // This ensures the background handler ALWAYS runs, even when app is killed
            // The notifee library on client will display the full-screen notification
            const message: admin.messaging.Message = {
                token: astrologer.fcmToken,
                // NO notification field - data-only message
                data: {
                    type: 'chat_request',
                    sessionId: request.sessionId,
                    userId: request.userId,
                    userName: request.userName,
                    userMobile: request.userMobile || '',
                    ratePerMinute: String(request.ratePerMinute),
                    intakeDetails: request.intakeDetails ? JSON.stringify(request.intakeDetails) : '',
                },
                android: {
                    priority: 'high',
                    // TTL of 30 seconds (matches incoming call timeout)
                    ttl: 30 * 1000,
                },
            };

            const response = await admin.messaging().send(message);
            console.log(`[NotificationService] High-priority request sent: ${response}`);
            return true;
        } catch (error: any) {
            console.error('[NotificationService] Error sending high-priority request:', error);

            // Handle invalid token
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
                await this.clearAstrologerToken(astrologerId);
            }

            return false;
        }
    }

    /**
     * Send notification to a specific FCM token
     */
    private async sendNotification(
        token: string,
        notification: { title: string; body: string },
        data?: Record<string, string>
    ): Promise<boolean> {
        try {
            const message: admin.messaging.Message = {
                token,
                notification: {
                    title: notification.title,
                    body: notification.body,
                },
                data: data || {},
                android: {
                    priority: 'high',
                    notification: {
                        channelId: 'chat_messages',
                        priority: 'high',
                        defaultSound: true,
                    },
                },
            };

            const response = await admin.messaging().send(message);
            console.log(`[NotificationService] Notification sent: ${response}`);
            return true;
        } catch (error: any) {
            console.error('[NotificationService] Send notification error:', error);

            // Handle invalid/expired tokens
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
                console.log('[NotificationService] Invalid token, should be cleaned up');
            }

            return false;
        }
    }

    /**
     * Clear invalid FCM token for user
     */
    async clearUserToken(userId: string): Promise<void> {
        try {
            await User.findByIdAndUpdate(userId, {
                $unset: { fcmToken: 1, fcmTokenUpdatedAt: 1 }
            });
            console.log(`[NotificationService] Cleared FCM token for user ${userId}`);
        } catch (error) {
            console.error('[NotificationService] Error clearing user token:', error);
        }
    }

    /**
     * Clear invalid FCM token for astrologer
     */
    async clearAstrologerToken(astrologerId: string): Promise<void> {
        try {
            await Astrologer.findByIdAndUpdate(astrologerId, {
                $unset: { fcmToken: 1, fcmTokenUpdatedAt: 1 }
            });
            console.log(`[NotificationService] Cleared FCM token for astrologer ${astrologerId}`);
        } catch (error) {
            console.error('[NotificationService] Error clearing astrologer token:', error);
        }
    }

    /**
     * Register/update FCM token for a user
     */
    async registerUserToken(userId: string, fcmToken: string): Promise<boolean> {
        try {
            await User.findByIdAndUpdate(userId, {
                fcmToken,
                fcmTokenUpdatedAt: new Date(),
            });
            console.log(`[NotificationService] Registered FCM token for user ${userId}`);
            return true;
        } catch (error) {
            console.error('[NotificationService] Error registering user token:', error);
            return false;
        }
    }

    /**
     * Register/update FCM token for an astrologer
     */
    async registerAstrologerToken(astrologerId: string, fcmToken: string): Promise<boolean> {
        try {
            await Astrologer.findByIdAndUpdate(astrologerId, {
                fcmToken,
                fcmTokenUpdatedAt: new Date(),
            });
            console.log(`[NotificationService] Registered FCM token for astrologer ${astrologerId}`);
            return true;
        } catch (error) {
            console.error('[NotificationService] Error registering astrologer token:', error);
            return false;
        }
    }
}

// Export singleton instance
export const notificationService = new NotificationService();
export default notificationService;

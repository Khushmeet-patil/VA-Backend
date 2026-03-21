"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const User_1 = __importDefault(require("../src/models/User"));
const Astrologer_1 = __importDefault(require("../src/models/Astrologer"));
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env') });
function cleanup() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('Connecting to database...');
            const uri = process.env.MONGO_URI;
            if (!uri) {
                console.error('MONGO_URI not found in environment');
                process.exit(1);
            }
            console.log(`Using URI (masked): ${uri.replace(/:([^@]+)@/, ':****@')}`);
            yield mongoose_1.default.connect(uri);
            console.log('Connected.');
            console.log('Starting Cleanup: Identifying mis-synced tokens in Astrologer collection...');
            let cleanedCount = 0;
            const astrologersWithTokens = yield Astrologer_1.default.find({ fcmToken: { $exists: true, $ne: '' } });
            console.log(`Found ${astrologersWithTokens.length} astrologers with tokens. Checking for duplicates in User collection...`);
            for (const astro of astrologersWithTokens) {
                if (!astro.fcmToken)
                    continue;
                const user = yield User_1.default.findById(astro.userId);
                if (user && user.fcmToken === astro.fcmToken) {
                    console.log(`Found duplicate token for astrologer ${astro.firstName} (User ID: ${astro.userId}). Token: ${astro.fcmToken.substring(0, 10)}...`);
                    // If they are exactly the same, it means the User App token was synced into the Astrologer doc.
                    // We clear it from the Astrologer doc to ensure "Astrologers Only" audience doesn't hit the User App.
                    yield Astrologer_1.default.findByIdAndUpdate(astro._id, { $unset: { fcmToken: 1, fcmTokenUpdatedAt: 1 } });
                    cleanedCount++;
                }
            }
            console.log(`Cleanup finished. ${cleanedCount} legacy synced tokens removed from Astrologer collection.`);
            process.exit(0);
        }
        catch (error) {
            console.error('Cleanup failed:', error);
            process.exit(1);
        }
    });
}
cleanup();

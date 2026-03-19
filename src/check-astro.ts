import mongoose from 'mongoose';
import Astrologer from './models/Astrologer';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/vedicastro_db');

async function check() {
    try {
        const astros = await Astrologer.find({});
        for (const astro of astros) {
            console.log(`Astro: ${astro.firstName} ${astro.lastName} - isOnline: ${astro.isOnline}, isBusy: ${astro.isBusy}, override: ${astro.isManualOverride}`);
            const currentDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];
            const sched = astro.availabilitySchedule.find(s => s.day === currentDay);
            if (sched) {
                console.log(`  Schedule today: ${sched.startTime} to ${sched.endTime} (enabled: ${sched.enabled})`);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
check();

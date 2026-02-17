
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './models/User';

dotenv.config();

const createAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || '');
        console.log('Connected to MongoDB');

        const email = 'admin@vedicastro.co.in';
        const password = 'adminpassword123'; // Change this!
        const mobile = '9999999999';

        const existingAdmin = await User.findOne({ email });
        if (existingAdmin) {
            console.log('Admin already exists');
            process.exit(0);
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const admin = new User({
            name: 'Super Admin',
            email,
            mobile,
            password: hashedPassword,
            role: 'admin',
            isVerified: true
        });

        await admin.save();
        console.log('Admin created successfully');
        console.log('Email:', email);
        console.log('Password:', password);

        process.exit(0);
    } catch (error) {
        console.error('Error creating admin:', error);
        process.exit(1);
    }
};

createAdmin();

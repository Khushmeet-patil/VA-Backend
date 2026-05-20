import { Request, Response } from 'express';
import PrewrittenMessage from '../models/PrewrittenMessage';

// Get all prewritten messages
export const getPrewrittenMessages = async (req: Request, res: Response) => {
    try {
        const messages = await PrewrittenMessage.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: messages });
    } catch (error: any) {
        console.error('Get prewritten messages error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Create a new prewritten message
export const createPrewrittenMessage = async (req: Request, res: Response) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ success: false, message: 'Message text is required' });
        }

        const newMessage = await PrewrittenMessage.create({ text: text.trim() });
        res.status(201).json({ success: true, message: 'Prewritten message created successfully', data: newMessage });
    } catch (error: any) {
        console.error('Create prewritten message error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Update a prewritten message
export const updatePrewrittenMessage = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { text } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({ success: false, message: 'Message text is required' });
        }

        const updatedMessage = await PrewrittenMessage.findByIdAndUpdate(
            id,
            { text: text.trim() },
            { new: true, runValidators: true }
        );

        if (!updatedMessage) {
            return res.status(404).json({ success: false, message: 'Prewritten message not found' });
        }

        res.status(200).json({ success: true, message: 'Prewritten message updated successfully', data: updatedMessage });
    } catch (error: any) {
        console.error('Update prewritten message error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Delete a prewritten message
export const deletePrewrittenMessage = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const deletedMessage = await PrewrittenMessage.findByIdAndDelete(id);

        if (!deletedMessage) {
            return res.status(404).json({ success: false, message: 'Prewritten message not found' });
        }

        res.status(200).json({ success: true, message: 'Prewritten message deleted successfully' });
    } catch (error: any) {
        console.error('Delete prewritten message error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

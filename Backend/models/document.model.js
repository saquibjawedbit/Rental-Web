import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
    {
        documentUrl: {
            type: String,
            required: true,
            trim: true,
        },
        imageUrl: {
            type: String,
            required: true,
            trim: true,
        },
        country: {
            type: String,
            required: true,
            trim: true,
        },
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        verified: {
            type: String,
            enum: ['verified', 'pending', 'declined'],
            default: 'pending'
        },
    },
    { timestamps: true }
);

export const Document = mongoose.model("Document", documentSchema);
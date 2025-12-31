import Model from "../models/Model.js";

// @desc    Get active models for users (public endpoint)
// @route   GET /api/models
// @access  Public
export const getActiveModels = async (req, res) => {
    try {
        const { type } = req.query; // video or image

        const query = { status: { $in: ["active", "beta"] } };
        if (type) query.type = type;

        const models = await Model.find(query)
            .select("-stats -apiConfig -__v")
            .sort({ displayOrder: 1, isPopular: -1 })
            .lean();

        res.status(200).json({
            success: true,
            data: { models },
        });
    } catch (error) {
        console.error("Get Active Models Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve active models.",
            error: error.message,
        });
    }
};

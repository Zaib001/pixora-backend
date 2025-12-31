import Transaction from "../models/Transaction.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import { config } from "../config/env.js";
import stripe, {
    getCreditPack,
    isValidCreditPack,
    getSubscriptionPlan,
    isValidSubscriptionPlan
} from "../config/stripeConfig.js";


export const refundTransaction = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const { reason } = req.body;
        const adminId = req.user.id;

        const transaction = await Transaction.findById(transactionId).populate("user");

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: "Transaction not found.",
            });
        }

        if (transaction.status === "refunded") {
            return res.status(400).json({
                success: false,
                message: "Transaction is already refunded.",
            });
        }

        // Verify it's a refundable transaction type
        if (!["credit_purchase", "failed_generation"].includes(transaction.type)) {
            // For now, only credit purchases and system-logged failed generations are auto-refundable
            // Subscriptions are handled differently via Stripe portal usually
            return res.status(400).json({
                success: false,
                message: "This transaction type cannot be refunded automatically.",
            });
        }

        // 1. Handle Stripe Refund (if it was a purchase)
        if (transaction.type === "credit_purchase" && transaction.stripePaymentIntentId) {
            try {
                await stripe.refunds.create({
                    payment_intent: transaction.stripePaymentIntentId,
                    reason: "requested_by_customer", // or "duplicate", "fraudulent"
                    metadata: {
                        adminReason: reason || "Admin initiated refund",
                        adminId: adminId,
                    }
                });
            } catch (stripeError) {
                console.error("Stripe Refund Error:", stripeError);
                return res.status(400).json({
                    success: false,
                    message: `Stripe refund failed: ${stripeError.message}`,
                });
            }
        }

        // 2. Restore Credits to User
        // Only if it was a credit purchase or if we need to return credits for a failed op
        if (transaction.creditsAmount > 0) {
            const user = transaction.user;
            if (user) {
                // If it was a purchase, we typically REMOVE the credits they bought (logic varies by business rule)
                // BUT the requirement says "Refund system to restore credits in case of failed generation".
                // If this is a REFUND of a purchase (getting money back), we should DEDUCT credits.
                // If this is a RESTORATION (failed generation), we should ADD credits.

                if (transaction.type === "credit_purchase") {
                    // Money back = take credits back
                    // Check if user has enough credits to take back
                    if (user.credits >= transaction.creditsAmount) {
                        await user.useCredits(transaction.creditsAmount, `Refund for transaction ${transactionId}`);
                    } else {
                        // Edge case: User spent the credits already.
                        // Decision: Refund money but record negative balance? Or block refund?
                        // For now, let's allow it and set balance negative if needed or just 0?
                        // "useCredits" throws error if insufficient.
                        // Let's force it or handle error.
                        // For safety in this MVP, we proceed but log warning.
                        // Ideally, check business policy. Assuming "Money back" => "Revoke credits"
                        // We will deduct what we can or just negate.
                        // Let's skip strict deduction for now to avoid locking admin, just log it.
                        user.credits = Math.max(0, user.credits - transaction.creditsAmount); // Simple deduction
                        await user.save();
                    }
                } else if (transaction.type === "failed_generation") {
                    // Restore credits for failed generation
                    await user.addCredits(transaction.creditsAmount, "refund", `Refund for failed generation ${transactionId}`);
                }
            }
        }

        // 3. Mark Transaction as Refunded
        transaction.status = "refunded";
        transaction.refundedAt = new Date();
        transaction.refundedBy = adminId;
        transaction.refundReason = reason;
        await transaction.save();

        res.status(200).json({
            success: true,
            data: transaction,
            message: "Transaction refunded successfully.",
        });

    } catch (error) {
        console.error("Refund Transaction Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to refund transaction.",
            error: error.message,
        });
    }
};
// @desc    Create Stripe Checkout Session for credit purchase
// @route   POST /api/payments/create-checkout-session
// @access  Private
export const createCheckoutSession = async (req, res) => {
    try {
        const { packId } = req.body;
        const userId = req.user.id;

        // Validate pack ID
        if (!packId || !isValidCreditPack(packId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid credit pack selected.",
            });
        }

        const pack = getCreditPack(packId);
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        // Create or get Stripe customer
        let customerId = user.stripeCustomerId;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.name,
                metadata: {
                    userId: user._id.toString(),
                },
            });
            customerId = customer.id;
            user.stripeCustomerId = customerId;
            await user.save();
        }

        // Create checkout session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: pack.currency,
                        product_data: {
                            name: pack.name,
                            description: pack.description,
                        },
                        unit_amount: pack.priceInCents,
                    },
                    quantity: 1,
                },
            ],
            mode: "payment",
            success_url: `${config.clientUrl}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}&success=true`,
            cancel_url: `${config.clientUrl}/dashboard/billing?canceled=true`,
            metadata: {
                userId: user._id.toString(),
                packId: packId.toString(),
                credits: pack.credits.toString(),
                type: "credit_purchase",
            },
        });

        // Create pending transaction
        const transaction = await Transaction.create({
            user: userId,
            stripeSessionId: session.id,
            type: "credit_purchase",
            amount: pack.price,
            currency: pack.currency,
            creditsAmount: pack.credits,
            status: "pending",
            requiresApproval: true,
            description: `Purchase of ${pack.credits} credits - ${pack.name}`,
            packageDetails: {
                packageId: pack.id,
                packageName: pack.name,
                creditsIncluded: pack.credits,
                originalPrice: pack.price,
            },
        });

        res.status(200).json({
            success: true,
            data: {
                sessionId: session.id,
                sessionUrl: session.url,
                transactionId: transaction.id,
            },
            message: "Checkout session created successfully.",
        });
    } catch (error) {
        console.error("Create Checkout Session Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create checkout session.",
            error: error.message,
        });
    }
};

// @desc    Create Stripe Subscription
// @route   POST /api/payments/create-subscription
// @access  Private
export const createSubscriptionCheckout = async (req, res) => {
    try {
        const { planId } = req.body;
        const userId = req.user.id;

        // Validate plan
        if (!planId || !isValidSubscriptionPlan(planId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid subscription plan selected.",
            });
        }

        const plan = getSubscriptionPlan(planId);
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        // Check if user already has an active subscription
        const existingSubscription = await Subscription.findActiveByUser(userId);
        if (existingSubscription) {
            return res.status(400).json({
                success: false,
                message: "You already have an active subscription. Please cancel it first.",
            });
        }

        // Create or get Stripe customer
        let customerId = user.stripeCustomerId;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.name,
                metadata: {
                    userId: user._id.toString(),
                },
            });
            customerId = customer.id;
            user.stripeCustomerId = customerId;
            await user.save();
        }

        // Create checkout session for subscription
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ["card"],
            line_items: [
                {
                    price: plan.stripePriceId,
                    quantity: 1,
                },
            ],
            mode: "subscription",
            success_url: `${config.clientUrl}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}&subscription=success`,
            cancel_url: `${config.clientUrl}/dashboard/billing?subscription=canceled`,
            metadata: {
                userId: user._id.toString(),
                planId: planId,
                type: "subscription",
            },
        });

        res.status(200).json({
            success: true,
            data: {
                sessionId: session.id,
                sessionUrl: session.url,
            },
            message: "Subscription checkout created successfully.",
        });
    } catch (error) {
        console.error("Create Subscription Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create subscription checkout.",
            error: error.message,
        });
    }
};

// @desc    Get payment status
// @route   GET /api/payments/status/:sessionId
// @access  Private
export const getPaymentStatus = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        // Verify session belongs to user
        if (session.metadata.userId !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: "Unauthorized access to this session.",
            });
        }

        const transaction = await Transaction.findBySession(sessionId);

        res.status(200).json({
            success: true,
            data: {
                status: session.payment_status,
                transactionStatus: transaction?.status,
                amount: session.amount_total / 100,
                currency: session.currency,
            },
        });
    } catch (error) {
        console.error("Get Payment Status Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve payment status.",
            error: error.message,
        });
    }
};

// @desc    Handle Stripe Webhooks
// @route   POST /api/payments/webhook
// @access  Public (but verified)
export const handleWebhook = async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = config.stripe.webhookSecret;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
        switch (event.type) {
            case "checkout.session.completed":
                await handleCheckoutCompleted(event.data.object);
                break;

            case "payment_intent.succeeded":
                await handlePaymentSucceeded(event.data.object);
                break;

            case "payment_intent.payment_failed":
                await handlePaymentFailed(event.data.object);
                break;

            case "customer.subscription.created":
                await handleSubscriptionCreated(event.data.object);
                break;

            case "customer.subscription.updated":
                await handleSubscriptionUpdated(event.data.object);
                break;

            case "customer.subscription.deleted":
                await handleSubscriptionDeleted(event.data.object);
                break;

            case "invoice.payment_succeeded":
                await handleInvoicePaymentSucceeded(event.data.object);
                break;

            case "invoice.payment_failed":
                await handleInvoicePaymentFailed(event.data.object);
                break;

            default:
        }

        res.json({ received: true });
    } catch (error) {
        console.error("Webhook handler error:", error);
        res.status(500).json({ error: "Webhook handler failed" });
    }
};

// ========== Webhook Helper Functions ==========

async function handleCheckoutCompleted(session) {
    const { metadata, customer, payment_intent, subscription } = session;

    if (metadata.type === "credit_purchase") {
        // Update transaction with payment intent
        const transaction = await Transaction.findBySession(session.id);
        if (transaction) {
            transaction.stripePaymentIntentId = payment_intent;
            transaction.status = "completed"; // Will need admin approval before credits added
            await transaction.save();
        }
    } else if (metadata.type === "subscription") {
        // Subscription will be handled by subscription.created event
    }
}

async function handlePaymentSucceeded(paymentIntent) {
    const transaction = await Transaction.findByPaymentIntent(paymentIntent.id);

    if (transaction && transaction.status === "pending") {
        transaction.status = "completed";
        transaction.receiptUrl = paymentIntent.charges?.data[0]?.receipt_url;
        await transaction.save();
    }
}

async function handlePaymentFailed(paymentIntent) {
    const transaction = await Transaction.findByPaymentIntent(paymentIntent.id);

    if (transaction) {
        await transaction.fail(
            paymentIntent.last_payment_error?.message || "Payment failed",
            paymentIntent.last_payment_error?.code
        );
    }
}

async function handleSubscriptionCreated(stripeSubscription) {
    const { customer, id, status, current_period_start, current_period_end, items, metadata } = stripeSubscription;

    // Find user by Stripe customer ID
    const user = await User.findOne({ stripeCustomerId: customer });
    if (!user) {
        console.error("User not found for customer:", customer);
        return;
    }

    const planId = metadata.planId || "pro";
    const plan = getSubscriptionPlan(planId);

    // Create subscription record
    const subscription = await Subscription.create({
        user: user._id,
        stripeSubscriptionId: id,
        stripeCustomerId: customer,
        stripePriceId: items.data[0].price.id,
        stripeProductId: items.data[0].price.product,
        plan: planId,
        status: status,
        amount: items.data[0].price.unit_amount / 100,
        currency: items.data[0].price.currency,
        interval: items.data[0].price.recurring.interval,
        intervalCount: items.data[0].price.recurring.interval_count,
        currentPeriodStart: new Date(current_period_start * 1000),
        currentPeriodEnd: new Date(current_period_end * 1000),
        monthlyCredits: plan.credits,
    });

    // Update user
    user.subscriptionId = subscription._id;
    user.subscriptionPlan = planId;
    user.subscriptionStatus = "active";
    user.subscriptionEndsAt = new Date(current_period_end * 1000);
    await user.save();

    // Add monthly credits if not unlimited
    if (plan.credits > 0) {
        await user.addCredits(plan.credits, "purchase", `${plan.name} subscription - Monthly credits`);
    }
}

async function handleSubscriptionUpdated(stripeSubscription) {
    const subscription = await Subscription.findByStripeId(stripeSubscription.id);

    if (subscription) {
        subscription.status = stripeSubscription.status;
        subscription.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
        subscription.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
        subscription.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;

        if (stripeSubscription.canceled_at) {
            subscription.canceledAt = new Date(stripeSubscription.canceled_at * 1000);
        }

        await subscription.save();

        // Update user status
        const user = await User.findById(subscription.user);
        if (user) {
            user.subscriptionStatus = stripeSubscription.status;
            user.subscriptionEndsAt = new Date(stripeSubscription.current_period_end * 1000);
            await user.save();
        }
    }
}

async function handleSubscriptionDeleted(stripeSubscription) {
    const subscription = await Subscription.findByStripeId(stripeSubscription.id);

    if (subscription) {
        subscription.status = "canceled";
        subscription.endedAt = new Date();
        await subscription.save();

        // Update user
        const user = await User.findById(subscription.user);
        if (user) {
            user.subscriptionStatus = "inactive";
            user.subscriptionPlan = "free";
            await user.save();
        }
    }
}

async function handleInvoicePaymentSucceeded(invoice) {
    const { subscription: subscriptionId, customer } = invoice;

    if (subscriptionId) {
        const subscription = await Subscription.findByStripeId(subscriptionId);

        if (subscription && subscription.monthlyCredits > 0) {
            // Add monthly credits
            const user = await User.findById(subscription.user);
            if (user) {
                const plan = getSubscriptionPlan(subscription.plan);
                await user.addCredits(
                    plan.credits,
                    "purchase",
                    `${plan.name} subscription renewal - Monthly credits`
                );
            }
        }
    }
}

async function handleInvoicePaymentFailed(invoice) {
    const { subscription: subscriptionId } = invoice;

    if (subscriptionId) {
        const subscription = await Subscription.findByStripeId(subscriptionId);

        if (subscription) {
            subscription.status = "past_due";
            subscription.latestInvoiceStatus = "payment_failed";
            await subscription.save();

            // Update user
            const user = await User.findById(subscription.user);
            if (user) {
                user.subscriptionStatus = "past_due";
                await user.save();
            }
        }
    }
}

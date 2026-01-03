import prisma from "../config/db.js";
import { sendThankYouEmail } from "../utils/email.js";
import { Decimal } from "@prisma/client/runtime/library.js";

const createDonation = async (userId, receiverId, amount, idempotencyKey) => {
  try {
    const decimalAmount = new Decimal(amount);

    // Check idempotency first (fastest check)
    const existingIdempotencyKey = await prisma.idempotencyKey.findUnique({
      where: { key: idempotencyKey },
      select: { transactionId: true },
    });

    if (existingIdempotencyKey) {
      // Return existing transaction
      const existingTransaction = await prisma.transaction.findUnique({
        where: { id: existingIdempotencyKey.transactionId },
        include: { donation: true },
      });
      return existingTransaction;
    }

    // Validate amount early
    if (decimalAmount.lte(0)) {
      throw new Error("Donation amount must be greater than zero");
    }

    // Prevent self-donation
    if (userId === receiverId) {
      throw new Error("Cannot donate to yourself");
    }

    // Batch fetch sender, receiver, and wallet in parallel
    const [sender, receiver, senderWallet] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true },
      }),
      prisma.user.findUnique({
        where: { id: receiverId },
        select: { id: true },
      }),
      prisma.wallet.findUnique({
        where: { userId: userId },
        select: { balance: true, userId: true },
      }),
    ]);

    // Validate existence
    if (!sender || !receiver) {
      throw new Error("sender or receiver does not exist");
    }

    if (!senderWallet) {
      throw new Error("Sender wallet not found");
    }

    // Check balance
    if (new Decimal(senderWallet.balance).lt(decimalAmount)) {
      throw new Error("Insufficient funds in wallet");
    }

    // Perform atomic transaction
    let result;
    try {
      result = await prisma.$transaction(
        async (tx) => {
          // Deduct from sender
          await tx.wallet.update({
            where: { userId: userId },
            data: { balance: { decrement: decimalAmount } },
          });

          // Add to receiver
          await tx.wallet.update({
            where: { userId: receiverId },
            data: { balance: { increment: decimalAmount } },
          });

          // Create donation
          const donation = await tx.donation.create({
            data: {
              amount: decimalAmount,
              senderId: userId,
              receiverId: receiverId,
            },
          });

          // Create transaction record
          const transactionRecord = await tx.transaction.create({
            data: {
              amount: decimalAmount,
              type: "DONATION",
              status: "COMPLETED",
              idempotencyKey: idempotencyKey,
              donationId: donation.id,
            },
          });

          // Create idempotency key
          await tx.idempotencyKey.create({
            data: {
              key: idempotencyKey,
              transactionId: transactionRecord.id,
            },
          });

          return transactionRecord;
        },
        {
          maxWait: 3000, // 3s max wait
          timeout: 8000, // 8s timeout
          isolationLevel: "ReadCommitted",
        }
      );
    } catch (e) {
      // Handle duplicate idempotency key under race
      if (e && e.code === "P2002") {
        const existing = await prisma.idempotencyKey.findUnique({
          where: { key: idempotencyKey },
          select: { transactionId: true },
        });
        if (existing?.transactionId) {
          const existingTx = await prisma.transaction.findUnique({
            where: { id: existing.transactionId },
            include: { donation: true },
          });
          return existingTx;
        }
      }
      throw e;
    }

    // Send email async AFTER response (fully non-blocking)
    setImmediate(async () => {
      try {
        const donationCount = await prisma.donation.count({
          where: { senderId: userId },
        });

        if (donationCount >= 2) {
          sendThankYouEmail(sender.email, sender.name).catch((err) => {
            console.error("Background email error:", err.message);
          });
        }
      } catch (err) {
        console.error("Background donation count error:", err.message);
      }
    });

    return result;
  } catch (error) {
    console.error("Create Donation Error:", error.message);
    throw error;
  }
};

const getDonationsByDateRange = async (
  userId,
  startDate,
  endDate,
  page = 1,
  limit = 10
) => {
  try {
    const skip = (page - 1) * limit;

    // Parse and validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start) || isNaN(end)) {
      throw new Error("Invalid date format");
    }

    // Fetch donations and count in parallel
    const [donations, totalCount] = await Promise.all([
      prisma.donation.findMany({
        where: {
          senderId: userId,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        include: {
          receiver: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.donation.count({
        where: {
          senderId: userId,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      }),
    ]);

    return {
      data: donations,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    };
  } catch (error) {
    console.error("Get Donations By Date Range Error:", error.message);
    throw error;
  }
};

const getSingleDonation = async (donationId, userId) => {
  try {
    const donation = await prisma.donation.findUnique({
      where: { id: donationId },
      include: {
        receiver: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        transaction: true,
      },
    });

    if (!donation) {
      throw new Error("Donation not found");
    }

    // Ensure access control
    if (donation.senderId !== userId && donation.receiverId !== userId) {
      throw new Error("Access denied to this donation");
    }

    return donation;
  } catch (error) {
    console.error("Get Single Donation Error:", error.message);
    throw error;
  }
};

const getDonationCount = async (userId) => {
  try {
    const count = await prisma.donation.count({
      where: { senderId: userId },
    });

    return count;
  } catch (error) {
    console.error("Get Donation Count Error:", error.message);
    throw error;
  }
};

export {
  createDonation,
  getDonationsByDateRange,
  getSingleDonation,
  getDonationCount,
};

import prisma from "../config/db.js";
import {
  createDonation,
  getDonationsByDateRange,
  getSingleDonation,
  getDonationCount,
} from "../services/donationService.js";

// create donation endpoint
const createDonationEndpoint = async (req, res) => {
  try {
    const { receiverId, amount, pin } = req.body;
    const userId = req.user.id;

    const idempotencyKey = req.headers["idempotency-key"];

    if (!idempotencyKey) {
      return res.status(400).json({
        message: "Idempotency-Key header is required",
      });
    }

    if (!receiverId || !amount || !pin) {
      return res.status(400).json({ message: "All fields are required." });
    }

    if (amount <= 0) {
      return res
        .status(400)
        .json({ message: "Amount must be greater than zero." });
    }

    // Verify PIN
    const transactionPin = await prisma.transactionPin.findUnique({
      where: { userId },
    });

    if (!transactionPin) {
      return res.status(403).json({
        message: "Transaction PIN not set.",
      });
    }

    const { verifyPassword } = await import("../utils/hash.js");
    const isPinValid = await verifyPassword(pin, transactionPin.pinHash);

    if (!isPinValid) {
      return res.status(403).json({ message: "Invalid transaction PIN." });
    }

    const transactionResult = await createDonation(
      userId,
      receiverId,
      amount,
      idempotencyKey
    );

    res.status(201).json({
      message: "Donation successful",
      data: transactionResult,
    });
  } catch (error) {
    console.error("Create Donation Error:", error.message);

    if (
      [
        "sender or receiver does not exist",
        "Cannot donate to yourself",
        "Insufficient funds in wallet",
      ].includes(error.message)
    ) {
      return res.status(400).json({ message: error.message });
    }

    res.status(500).json({ message: "Internal: Unable to process donation" });
  }
};

const getDonationsByPeriod = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate, page = 1, limit = 10 } = req.query;

    // validate dates
    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ message: "Start date and end date are required." });
    }

    const result = await getDonationsByDateRange(
      userId,
      startDate,
      endDate,
      parseInt(page),
      parseInt(limit)
    );

    res.status(200).json({
      message: "Donations retrieved successfully",
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Get Donations Error:", error.message);
    if (error.message === "Invalid date format") {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: "Internal: Unable to retrieve donations" });
  }
};

const viewSingleDonation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { donationId } = req.params;

    // Fixed: Pass parameters in correct order (donationId, userId)
    const donation = await getSingleDonation(parseInt(donationId), userId);

    // validate donation
    if (!donation) {
      return res.status(404).json({ message: "Donation not found." });
    }

    res.status(200).json({
      message: "Donation retrieved successfully",
      data: donation,
    });
  } catch (error) {
    console.error("View Single Donation Error:", error.message);
    if (error.message === "Donation not found") {
      return res.status(404).json({ message: error.message });
    }
    if (error.message === "Access denied to this donation") {
      return res.status(403).json({ message: error.message });
    }
    res.status(500).json({ message: "Internal: Unable to retrieve donation" });
  }
};

const getDonationCountEndpoint = async (req, res) => {
  try {
    const userId = req.user.id;

    const count = await getDonationCount(userId);

    res.status(200).json({
      message: "Donation count retrieved successfully",
      data: { count },
    });
  } catch (error) {
    console.error("Get Donation Count Error:", error.message);
    res
      .status(500)
      .json({ message: "Internal: Unable to retrieve donation count" });
  }
};

export {
  createDonationEndpoint,
  getDonationsByPeriod,
  viewSingleDonation,
  getDonationCountEndpoint,
};

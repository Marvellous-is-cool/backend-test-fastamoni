import bcrypt from "bcrypt";
import prisma from "../config/db.js";
import { Prisma } from "@prisma/client";

// create transaction pin
const createTransactionPin = async (req, res) => {
  // Implementation for creating transaction PIN
  try {
    if (!prisma) {
      console.error("Prisma client not initialized");
      return res.status(500).json({ message: "Server error" });
    }

    const { pin } = req.body;
    const userId = req.user?.id;

    // validate input (6-digit numeric pin)
    if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      return res
        .status(400)
        .json({ message: "Transaction PIN must be a 6-digit number." });
    }

    // check if pin already exists
    const existingPin = await prisma.transactionPin.findUnique({
      where: { userId },
    });

    if (existingPin) {
      return res.status(409).json({
        message:
          "PIN already exists. You can update it instead in your profile",
      });
    }

    // hash the pin
    const hashedPin = await bcrypt.hash(pin, 10);

    // create transaction pin (single pin per user enforced by unique constraint)
    const transactionPin = await prisma.transactionPin.upsert({
      where: { userId: userId },
      update: { pinHash: hashedPin },
      create: {
        pinHash: hashedPin,
        user: {
          connect: { id: userId },
        },
      },
    });

    res.status(201).json({
      message: "Transaction PIN created successfully",
      data: {
        id: transactionPin.id,
        createdAt: transactionPin.createdAt,
      },
    });
  } catch (error) {
    console.error("Create PIN Error:", error.message);
    res.status(500).json({ message: "Internal: Unable to create PIN" });
  }
};

// update transaction pin
const updateTransactionPin = async (req, res) => {
  // Implementation for updating transaction PIN
  try {
    if (!prisma) {
      console.error("Prisma client not initialized");
      return res.status(500).json({ message: "Server error" });
    }

    const { oldPin, newPin } = req.body;
    const userId = req.user?.id;

    // validate input
    // if there is no old or new pin
    if (!oldPin || !newPin) {
      return res
        .status(400)
        .json({ message: "Old PIN and new PIN are required." });
    }

    // if new pin is not 6-digit numeric
    if (newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
      return res
        .status(400)
        .json({ message: "New PIN must be a 6-digit number." });
    }

    // fetch existing pin
    const existingPin = await prisma.transactionPin.findUnique({
      where: { userId },
    });

    if (!existingPin) {
      return res.status(404).json({ message: "No existing PIN found." });
    }

    // verify old pin (through hashing  comparison)
    const isOldPinValid = await bcrypt.compare(
      oldPin ?? "",
      existingPin.pinHash
    );

    if (!isOldPinValid) {
      return res.status(401).json({ message: "Old PIN is incorrect." });
    }

    // hash the new pin
    const hashedNewPin = await bcrypt.hash(newPin, 10);

    // update transaction pin
    const updatedPin = await prisma.transactionPin.update({
      where: { userId },
      data: { pinHash: hashedNewPin },
    });

    res.status(200).json({
      message: "Transaction PIN updated successfully",
      data: {
        userId: updatedPin.userId,
        updatedAt: updatedPin.updatedAt,
      },
    });
  } catch (error) {
    console.error("Update PIN Error:", error);
    res.status(500).json({ message: "Internal: Unable to update PIN" });
  }
};

// top-up wallet (minimal security with "TOP-SECRET" header)
const topUpWallet = async (req, res) => {
  try {
    if (!prisma) {
      console.error("Prisma client not initialized");
      return res.status(500).json({ message: "Server error" });
    }
    // check for secret header
    const secret = process.env.TOPUP_SECRET;
    const incoming =
      req.headers["x-topup-secret"] || req.headers["X-TOPUP-SECRET"];

    if (!secret || incoming !== secret) {
      return res.status(403).json({
        message: "Top-up endpoint not allowed. Missing or invalid secret.",
      });
    }

    const { amount } = req.body;
    const numeric = Number(amount);

    if (!amount || numeric <= 0) {
      return res
        .status(400)
        .json({ message: "Amount must be less than zero." });
    }

    const userId = req.user?.id;

    const updatedWallet = await prisma.wallet.upsert({
      where: { userId },
      update: { balance: { increment: numeric } },
      create: {
        userId,
        balance: numeric,
      },
    });

    // simple audit log
    console.info(
      `Wallet Top-Up: User ${userId} topped up ${numeric} at=${new Date().toISOString()}. New balance: ${
        updatedWallet.balance
      }`
    );

    res.status(200).json({
      message: "Wallet topped up successfully",
      data: updatedWallet,
    });
  } catch (error) {
    console.error("Top-Up Wallet Error:", error);
    res.status(500).json({ message: "Internal: Unable to top-up wallet" });
  }
};

// get wallet
const getWallet = async (req, res) => {
  // Implementation for getting wallet details
  try {
    if (!prisma) {
      console.error("Prisma client not initialized");
      return res.status(500).json({ message: "Server error" });
    }

    const userId = req.user?.id;
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found." });
    }

    res.status(200).json({
      message: "Wallet retrieved successfully",
      data: wallet,
    });
  } catch (error) {
    console.error("Get Wallet Error:", error);
    res.status(500).json({ message: "Internal: Unable to retrieve wallet" });
  }
};

export { createTransactionPin, updateTransactionPin, getWallet, topUpWallet };

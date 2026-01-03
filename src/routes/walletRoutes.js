import express from "express";
import authMiddleware from "../middlewares/authMiddleware.js";
import {
  createTransactionPin,
  updateTransactionPin,
  getWallet,
  topUpWallet,
} from "../controllers/walletController.js";

const router = express.Router();

// All wallet routes are protected
router.use(authMiddleware);

// create transaction pin (api/wallet/create-pin)
router.post("/create-pin", createTransactionPin);

// update transaction pin (api/wallet/update-pin)
router.put("/update-pin", updateTransactionPin);

// get wallet details (api/wallet/)
router.get("/", getWallet);

// top-up wallet (api/wallet/top-up)
router.post("/top-up", topUpWallet);

export default router;

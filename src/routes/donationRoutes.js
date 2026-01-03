import express from "express";
import authMiddleware from "../middlewares/authMiddleware.js";
import {
  createDonationEndpoint,
  getDonationsByPeriod,
  viewSingleDonation,
  getDonationCountEndpoint,
} from "../controllers/donationController.js";

const router = express.Router();

// protect all donation routes
router.use(authMiddleware);

// create donation (POST /api/donations/donate)
router.post("/donate", createDonationEndpoint);

// get donations by date range (GET /api/donations/by-period?startDate=2026-01-01&endDate=2026-01-31&page=1&limit=10)
router.get("/by-period", getDonationsByPeriod);

// get donation count (GET /api/donations/count)
router.get("/count", getDonationCountEndpoint);

// view single donation (GET /api/donations/:donationId)
router.get("/:donationId", viewSingleDonation);

export default router;

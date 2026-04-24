import twilio from "twilio";
import {
  sendVerificationCode,
  checkVerificationCode,
  requirePhoneVerified,
} from "./phone";

jest.mock("twilio", () => {
  return jest.fn();
});

describe("Phone Service (Twilio Verification)", () => {
  const mockCreateVerification = jest.fn();
  const mockCreateCheck = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Twilio client structure
    (twilio as unknown as jest.Mock).mockImplementation(() => ({
      verify: {
        v2: {
          services: () => ({
            verifications: {
              create: mockCreateVerification,
            },
            verificationChecks: {
              create: mockCreateCheck,
            },
          }),
        },
      },
    }));
  });

  // -------------------------
  // sendVerificationCode
  // -------------------------
  describe("sendVerificationCode", () => {
    it("calls Twilio verify API with correct params", async () => {
      mockCreateVerification.mockResolvedValue({ sid: "123" });

      await sendVerificationCode("+15551234567");

      expect(mockCreateVerification).toHaveBeenCalledWith({
        to: "+15551234567",
        channel: "sms",
      });
    });

    it("surfaces Twilio errors", async () => {
      mockCreateVerification.mockRejectedValue(
        new Error("Twilio error")
      );

      await expect(
        sendVerificationCode("+15551234567")
      ).rejects.toThrow("Twilio error");
    });
  });

  // -------------------------
  // checkVerificationCode
  // -------------------------
  describe("checkVerificationCode", () => {
    it("returns true when status is approved", async () => {
      mockCreateCheck.mockResolvedValue({ status: "approved" });

      const result = await checkVerificationCode(
        "+15551234567",
        "123456"
      );

      expect(result).toBe(true);
    });

    it("returns false when status is pending", async () => {
      mockCreateCheck.mockResolvedValue({ status: "pending" });

      const result = await checkVerificationCode(
        "+15551234567",
        "123456"
      );

      expect(result).toBe(false);
    });

    it("returns false when status is invalid/canceled", async () => {
      mockCreateCheck.mockResolvedValue({ status: "canceled" });

      const result = await checkVerificationCode(
        "+15551234567",
        "123456"
      );

      expect(result).toBe(false);
    });

    it("surfaces Twilio errors", async () => {
      mockCreateCheck.mockRejectedValue(
        new Error("Verification failed")
      );

      await expect(
        checkVerificationCode("+15551234567", "123456")
      ).rejects.toThrow("Verification failed");
    });
  });

  // -------------------------
  // requirePhoneVerified
  // -------------------------
  describe("requirePhoneVerified", () => {
    it("does nothing if phone is verified", async () => {
      await expect(
        requirePhoneVerified("user1", true)
      ).resolves.toBeUndefined();
    });

    it("throws error if phone is not verified", async () => {
      await expect(
        requirePhoneVerified("user1", false)
      ).rejects.toThrow("Phone verification required");
    });
  });
});
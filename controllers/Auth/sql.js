// SQL for admins, sign in, forgot-password OTPs and the audit trail.
// Query text only: each entry returns the SQL string, and authDA.js runs it (sql.NAME()).

module.exports = {
    /* ---------------- admins ---------------- */

    GET_ADMIN_BY_USERNAME: () => {
        return `
            SELECT
                AdminId,
                UserName,
                Name,
                PasswordHash
            FROM dbo.Admins
            WHERE UserName = @UserName
              AND IsActive = 1
        `;
    },

    GET_ADMIN: () => {
        return `
            SELECT
                AdminId,
                UserName,
                Name,
                LastLoginOn
            FROM dbo.Admins
            WHERE AdminId = @Id
              AND IsActive = 1
        `;
    },

    GET_ADMIN_FOR_RESET: () => {
        return `
            SELECT
                AdminId,
                Name,
                Mobile
            FROM dbo.Admins
            WHERE UserName = @UserName
              AND IsActive = 1
        `;
    },

    MARK_SIGNED_IN: () => {
        return `
            UPDATE dbo.Admins
            SET LastLoginOn = SYSUTCDATETIME()
            WHERE AdminId = @Id
        `;
    },

    SET_PASSWORD: () => {
        return `
            UPDATE dbo.Admins
            SET PasswordHash = @Hash
            WHERE AdminId = @Id
        `;
    },

    /* ---------------- forgot-password OTPs (one live OTP per admin) ---------------- */

    LAST_OTP_SENT: () => {
        return `
            SELECT TOP 1
                CreatedOn
            FROM dbo.PasswordResetOtps
            WHERE AdminId = @AdminId
            ORDER BY CreatedOn DESC
        `;
    },

    // A new request retires the older OTPs.
    RETIRE_OTPS: () => {
        return `
            UPDATE dbo.PasswordResetOtps
            SET UsedOn = SYSUTCDATETIME()
            WHERE AdminId = @AdminId
              AND UsedOn IS NULL
        `;
    },

    INSERT_OTP: () => {
        return `
            INSERT INTO dbo.PasswordResetOtps (
                AdminId,
                OtpHash,
                ExpiresOn,
                RequestIp
            )
            VALUES (
                @AdminId,
                @OtpHash,
                DATEADD(MINUTE, @Minutes, SYSUTCDATETIME()),
                @RequestIp
            )
        `;
    },

    GET_LIVE_OTP: () => {
        return `
            SELECT TOP 1
                OtpId,
                OtpHash,
                Attempts
            FROM dbo.PasswordResetOtps
            WHERE AdminId = @AdminId
              AND UsedOn IS NULL
              AND VerifiedOn IS NULL
              AND ExpiresOn > SYSUTCDATETIME()
            ORDER BY CreatedOn DESC
        `;
    },

    // Too many wrong tries cancel the OTP.
    OTP_WRONG: () => {
        return `
            UPDATE dbo.PasswordResetOtps
            SET Attempts = Attempts + 1,
                UsedOn = CASE WHEN Attempts + 1 >= @MaxAttempts THEN SYSUTCDATETIME() ELSE UsedOn END
            WHERE OtpId = @OtpId
        `;
    },

    // A correct OTP is exchanged for a short-lived reset token (only its hash is stored).
    OTP_VERIFIED: () => {
        return `
            UPDATE dbo.PasswordResetOtps
            SET VerifiedOn = SYSUTCDATETIME(),
                ResetTokenHash = @TokenHash,
                ResetExpiresOn = DATEADD(MINUTE, @Minutes, SYSUTCDATETIME())
            WHERE OtpId = @OtpId
              AND VerifiedOn IS NULL
              AND UsedOn IS NULL
        `;
    },

    GET_RESET_BY_TOKEN: () => {
        return `
            SELECT
                o.OtpId,
                o.AdminId
            FROM dbo.PasswordResetOtps o
            JOIN dbo.Admins a ON a.AdminId = o.AdminId AND a.IsActive = 1
            WHERE o.ResetTokenHash = @TokenHash
              AND o.UsedOn IS NULL
              AND o.ResetExpiresOn > SYSUTCDATETIME()
        `;
    },

    USE_RESET: () => {
        return `
            UPDATE dbo.PasswordResetOtps
            SET UsedOn = SYSUTCDATETIME()
            WHERE OtpId = @OtpId
              AND UsedOn IS NULL
        `;
    },

    /* ---------------- audit trail ---------------- */

    INSERT_AUDIT: () => {
        return `
            INSERT INTO dbo.AdminAudit (
                AdminId,
                Action,
                Details
            )
            VALUES (
                @AdminId,
                @Action,
                @Details
            )
        `;
    },
};

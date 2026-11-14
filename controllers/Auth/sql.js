// SQL for admins, sign in, forgot-password OTPs and the audit trail.
// Query text only: each entry returns the SQL string, and authDA.js runs it (sql.NAME()).

module.exports = {
    GET_ADMIN_BY_USERNAME: () => `
        SELECT AdminId, UserName, Name, PasswordHash
        FROM dbo.Admins
        WHERE UserName = @UserName AND IsActive = 1`,
    GET_ADMIN: () => `SELECT AdminId, UserName, Name, LastLoginOn FROM dbo.Admins WHERE AdminId = @Id AND IsActive = 1`,
    GET_ADMIN_FOR_RESET: () => `SELECT AdminId, Name, Mobile FROM dbo.Admins WHERE UserName = @UserName AND IsActive = 1`,
    MARK_SIGNED_IN: () => `UPDATE dbo.Admins SET LastLoginOn = SYSUTCDATETIME() WHERE AdminId = @Id`,
    SET_PASSWORD: () => `UPDATE dbo.Admins SET PasswordHash = @Hash WHERE AdminId = @Id`,

    // One live OTP per admin: a new request retires the older ones.
    LAST_OTP_SENT: () => `SELECT TOP 1 CreatedOn FROM dbo.PasswordResetOtps WHERE AdminId = @AdminId ORDER BY CreatedOn DESC`,
    RETIRE_OTPS: () => `UPDATE dbo.PasswordResetOtps SET UsedOn = SYSUTCDATETIME() WHERE AdminId = @AdminId AND UsedOn IS NULL`,
    INSERT_OTP: () => `
        INSERT INTO dbo.PasswordResetOtps (AdminId, OtpHash, ExpiresOn, RequestIp)
        VALUES (@AdminId, @OtpHash, DATEADD(MINUTE, @Minutes, SYSUTCDATETIME()), @RequestIp)`,
    GET_LIVE_OTP: () => `
        SELECT TOP 1 OtpId, OtpHash, Attempts
        FROM dbo.PasswordResetOtps
        WHERE AdminId = @AdminId AND UsedOn IS NULL AND VerifiedOn IS NULL AND ExpiresOn > SYSUTCDATETIME()
        ORDER BY CreatedOn DESC`,
    OTP_WRONG: () => `
        UPDATE dbo.PasswordResetOtps
        SET Attempts = Attempts + 1,
            UsedOn = CASE WHEN Attempts + 1 >= @MaxAttempts THEN SYSUTCDATETIME() ELSE UsedOn END
        WHERE OtpId = @OtpId`,
    // A correct OTP is exchanged for a short-lived reset token (only its hash is stored).
    OTP_VERIFIED: () => `
        UPDATE dbo.PasswordResetOtps
        SET VerifiedOn = SYSUTCDATETIME(), ResetTokenHash = @TokenHash, ResetExpiresOn = DATEADD(MINUTE, @Minutes, SYSUTCDATETIME())
        WHERE OtpId = @OtpId AND VerifiedOn IS NULL AND UsedOn IS NULL`,
    GET_RESET_BY_TOKEN: () => `
        SELECT o.OtpId, o.AdminId
        FROM dbo.PasswordResetOtps o
        JOIN dbo.Admins a ON a.AdminId = o.AdminId AND a.IsActive = 1
        WHERE o.ResetTokenHash = @TokenHash AND o.UsedOn IS NULL AND o.ResetExpiresOn > SYSUTCDATETIME()`,
    USE_RESET: () => `UPDATE dbo.PasswordResetOtps SET UsedOn = SYSUTCDATETIME() WHERE OtpId = @OtpId AND UsedOn IS NULL`,

    INSERT_AUDIT: () => `
        INSERT INTO dbo.AdminAudit (AdminId, Action, Details)
        VALUES (@AdminId, @Action, @Details)`,
};

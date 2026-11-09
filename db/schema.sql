/* FDSC database schema. Run once on an empty database (SQL Server / Azure SQL).
   Creates the admin accounts table, the admin audit trail, the forgot-password OTP table
   and the enquiries table used by the public website form. Safe to re-run: each table is created only if missing. */

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON; -- sqlcmd turns this off by default; procedures keep the setting they were created with
GO

IF OBJECT_ID(N'dbo.Admins', N'U') IS NULL
CREATE TABLE dbo.Admins (
    AdminId       UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Admins PRIMARY KEY DEFAULT NEWID(),
    UserName      NVARCHAR(100)    NOT NULL CONSTRAINT UQ_Admins_UserName UNIQUE,
    Name          NVARCHAR(150)    NOT NULL,
    PasswordHash  NVARCHAR(255)    NOT NULL,
    Mobile        NVARCHAR(15)     NULL, -- 10-digit Indian mobile for the forgot-password OTP
    IsActive      BIT              NOT NULL CONSTRAINT DF_Admins_IsActive DEFAULT 1,
    LastLoginOn   DATETIME2        NULL,
    CreatedOn     DATETIME2        NOT NULL CONSTRAINT DF_Admins_CreatedOn DEFAULT SYSUTCDATETIME()
);
GO

-- Older databases: add the mobile column if it is missing.
IF COL_LENGTH(N'dbo.Admins', N'Mobile') IS NULL
    ALTER TABLE dbo.Admins ADD Mobile NVARCHAR(15) NULL;
GO

IF OBJECT_ID(N'dbo.AdminAudit', N'U') IS NULL
CREATE TABLE dbo.AdminAudit (
    AuditId   BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AdminAudit PRIMARY KEY,
    AdminId   UNIQUEIDENTIFIER     NULL,
    Action    NVARCHAR(50)         NOT NULL,
    Details   NVARCHAR(MAX)        NULL,
    CreatedOn DATETIME2            NOT NULL CONSTRAINT DF_AdminAudit_CreatedOn DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID(N'dbo.Enquiries', N'U') IS NULL
CREATE TABLE dbo.Enquiries (
    EnquiryId     BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Enquiries PRIMARY KEY,
    Name          NVARCHAR(150)        NOT NULL,
    Phone         NVARCHAR(20)         NOT NULL,
    Email         NVARCHAR(200)        NULL,
    Course        NVARCHAR(50)         NOT NULL,
    Qualification NVARCHAR(100)        NULL,
    Message       NVARCHAR(2000)       NULL,
    Source        NVARCHAR(30)         NOT NULL CONSTRAINT DF_Enquiries_Source DEFAULT N'website',
    Status        NVARCHAR(20)         NOT NULL CONSTRAINT DF_Enquiries_Status DEFAULT N'New',
    CreatedOn     DATETIME2            NOT NULL CONSTRAINT DF_Enquiries_CreatedOn DEFAULT SYSUTCDATETIME()
);
GO

-- Forgot-password OTPs. Only hashes are stored (never the OTP or the reset token itself).
IF OBJECT_ID(N'dbo.PasswordResetOtps', N'U') IS NULL
CREATE TABLE dbo.PasswordResetOtps (
    OtpId          BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PasswordResetOtps PRIMARY KEY,
    AdminId        UNIQUEIDENTIFIER     NOT NULL CONSTRAINT FK_PasswordResetOtps_Admins REFERENCES dbo.Admins (AdminId),
    OtpHash        CHAR(64)             NOT NULL,
    ExpiresOn      DATETIME2            NOT NULL,
    Attempts       INT                  NOT NULL CONSTRAINT DF_PasswordResetOtps_Attempts DEFAULT 0,
    VerifiedOn     DATETIME2            NULL,
    ResetTokenHash CHAR(64)             NULL,
    ResetExpiresOn DATETIME2            NULL,
    UsedOn         DATETIME2            NULL,
    RequestIp      NVARCHAR(64)         NULL,
    CreatedOn      DATETIME2            NOT NULL CONSTRAINT DF_PasswordResetOtps_CreatedOn DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PasswordResetOtps_Admin')
    CREATE INDEX IX_PasswordResetOtps_Admin ON dbo.PasswordResetOtps (AdminId, CreatedOn DESC);
GO

-- Enquiry follow-up: admin notes and who changed the status last.
IF COL_LENGTH(N'dbo.Enquiries', N'Notes') IS NULL
    ALTER TABLE dbo.Enquiries ADD Notes NVARCHAR(1000) NULL;
IF COL_LENGTH(N'dbo.Enquiries', N'UpdatedOn') IS NULL
    ALTER TABLE dbo.Enquiries ADD UpdatedOn DATETIME2 NULL;
IF COL_LENGTH(N'dbo.Enquiries', N'UpdatedBy') IS NULL
    ALTER TABLE dbo.Enquiries ADD UpdatedBy UNIQUEIDENTIFIER NULL;
-- When the visitor ticked the consent box on the website form (DPDP Act 2023 record).
IF COL_LENGTH(N'dbo.Enquiries', N'ConsentOn') IS NULL
    ALTER TABLE dbo.Enquiries ADD ConsentOn DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Enquiries_Status_CreatedOn')
    CREATE INDEX IX_Enquiries_Status_CreatedOn ON dbo.Enquiries (Status, CreatedOn DESC);
GO

/* ---------------------------------------------------------------------------
   Repeat enquiries. When the same person (same mobile, or same email if given)
   enquires again while their enquiry is still open (New / Contacted) and was
   active in the last 30 days, no new row is created: the new details are kept
   in dbo.EnquiryRepeats, the count goes up and the enquiry goes back to "New".
   --------------------------------------------------------------------------- */
IF COL_LENGTH(N'dbo.Enquiries', N'EnquiryCount') IS NULL
    ALTER TABLE dbo.Enquiries ADD EnquiryCount INT NOT NULL CONSTRAINT DF_Enquiries_EnquiryCount DEFAULT 1;
IF COL_LENGTH(N'dbo.Enquiries', N'LastEnquiryOn') IS NULL
    ALTER TABLE dbo.Enquiries ADD LastEnquiryOn DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Enquiries_Phone')
    CREATE INDEX IX_Enquiries_Phone ON dbo.Enquiries (Phone) INCLUDE (Status, CreatedOn, LastEnquiryOn);
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Enquiries_Email' AND has_filter = 1)
    DROP INDEX IX_Enquiries_Email ON dbo.Enquiries;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Enquiries_Email')
    CREATE INDEX IX_Enquiries_Email ON dbo.Enquiries (Email) INCLUDE (Status, CreatedOn, LastEnquiryOn);
GO
IF OBJECT_ID(N'dbo.EnquiryRepeats', N'U') IS NULL
CREATE TABLE dbo.EnquiryRepeats (
    RepeatId      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_EnquiryRepeats PRIMARY KEY,
    EnquiryId     BIGINT               NOT NULL CONSTRAINT FK_EnquiryRepeats_Enquiries REFERENCES dbo.Enquiries (EnquiryId) ON DELETE CASCADE,
    Name          NVARCHAR(150)        NOT NULL,
    Email         NVARCHAR(200)        NULL,
    Course        NVARCHAR(50)         NOT NULL,
    Qualification NVARCHAR(100)        NULL,
    Message       NVARCHAR(2000)       NULL,
    CreatedOn     DATETIME2            NOT NULL CONSTRAINT DF_EnquiryRepeats_CreatedOn DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_EnquiryRepeats_Enquiry')
    CREATE INDEX IX_EnquiryRepeats_Enquiry ON dbo.EnquiryRepeats (EnquiryId, CreatedOn DESC);
GO

-- The only way the public website saves an enquiry. Returns nothing, so the website
-- login can never learn whether a mobile number or email has enquired before.
CREATE OR ALTER PROCEDURE dbo.SubmitEnquiry
    @Name             NVARCHAR(150),
    @Phone            NVARCHAR(20),
    @Email            NVARCHAR(200) = NULL,
    @Course           NVARCHAR(50),
    @Qualification    NVARCHAR(100) = NULL,
    @Message          NVARCHAR(2000) = NULL,
    @RepeatWindowDays INT = 30
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @Now DATETIME2 = SYSUTCDATETIME(), @Id BIGINT;

    BEGIN TRANSACTION;
    -- UPDLOCK + HOLDLOCK: two submits at the same moment can't both create a new row.
    SELECT TOP (1) @Id = EnquiryId
    FROM dbo.Enquiries WITH (UPDLOCK, HOLDLOCK)
    WHERE Status IN (N'New', N'Contacted')
      AND COALESCE(LastEnquiryOn, CreatedOn) >= DATEADD(DAY, -@RepeatWindowDays, @Now)
      AND (Phone = @Phone OR (@Email IS NOT NULL AND Email = @Email))
    ORDER BY COALESCE(LastEnquiryOn, CreatedOn) DESC;

    IF @Id IS NULL
        INSERT INTO dbo.Enquiries (Name, Phone, Email, Course, Qualification, Message, Source, ConsentOn)
        VALUES (@Name, @Phone, @Email, @Course, @Qualification, @Message, N'website', @Now);
    ELSE
    BEGIN
        INSERT INTO dbo.EnquiryRepeats (EnquiryId, Name, Email, Course, Qualification, Message, CreatedOn)
        VALUES (@Id, @Name, @Email, @Course, @Qualification, @Message, @Now);
        UPDATE dbo.Enquiries
        SET EnquiryCount = EnquiryCount + 1,
            LastEnquiryOn = @Now,
            ConsentOn = @Now,
            Email = COALESCE(Email, @Email),
            Status = N'New'
        WHERE EnquiryId = @Id;
    END
    COMMIT TRANSACTION;
END
GO

-- Website login: may run SubmitEnquiry only (no direct INSERT/SELECT on any table).
IF DATABASE_PRINCIPAL_ID(N'fdsc_public') IS NOT NULL
BEGIN
    GRANT EXECUTE ON dbo.SubmitEnquiry TO fdsc_public;
    REVOKE INSERT ON dbo.Enquiries FROM fdsc_public;
END
GO

// SQL for the enquiries list, summary, history and follow-up updates.
// Query text only: each entry returns the SQL string, and enquiryDA.js runs it (sql.NAME()).

// Filters shared by LIST and COUNT. Each is optional: NULL means "any".
const FILTERS = `
            WHERE (@Status IS NULL OR e.Status = @Status)
              AND (@Course IS NULL OR e.Course = @Course)
              AND (@Search IS NULL OR e.Name LIKE @Search OR e.Phone LIKE @Search OR e.Email LIKE @Search)`;

module.exports = {
    // One page of enquiries, latest activity first (a repeat enquiry moves back to the top).
    LIST: () => {
        return `
            SELECT
                e.EnquiryId,
                e.Name,
                e.Phone,
                e.Email,
                e.Course,
                e.Qualification,
                e.Message,
                e.Source,
                e.Status,
                e.Notes,
                e.CreatedOn,
                e.UpdatedOn,
                e.ConsentOn,
                e.EnquiryCount,
                COALESCE(e.LastEnquiryOn, e.CreatedOn) AS LastEnquiryOn,
                a.Name AS UpdatedByName
            FROM dbo.Enquiries e
            LEFT JOIN dbo.Admins a ON a.AdminId = e.UpdatedBy
            ${FILTERS}
            ORDER BY COALESCE(e.LastEnquiryOn, e.CreatedOn) DESC, e.EnquiryId DESC
            OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
        `;
    },

    COUNT: () => {
        return `
            SELECT
                COUNT(*) AS Total
            FROM dbo.Enquiries e
            ${FILTERS}
        `;
    },

    // Two result sets: counts per status, then how many enquiries came in today.
    SUMMARY: () => {
        return `
            SELECT
                Status,
                COUNT(*) AS Count
            FROM dbo.Enquiries
            GROUP BY Status;

            SELECT
                COUNT(*) AS Today
            FROM dbo.Enquiries
            WHERE COALESCE(LastEnquiryOn, CreatedOn) >= CAST(SYSUTCDATETIME() AS date);
        `;
    },

    // Later enquiries from the same person that were merged into this one (newest first).
    REPEATS: () => {
        return `
            SELECT
                RepeatId,
                Name,
                Email,
                Course,
                Qualification,
                Message,
                CreatedOn
            FROM dbo.EnquiryRepeats
            WHERE EnquiryId = @Id
            ORDER BY CreatedOn DESC
        `;
    },

    // Status and/or notes; NULL status keeps the current one, notes change only when sent.
    UPDATE: () => {
        return `
            UPDATE dbo.Enquiries
            SET Status = COALESCE(@Status, Status),
                Notes = CASE WHEN @NotesSet = 1 THEN @Notes ELSE Notes END,
                UpdatedOn = SYSUTCDATETIME(),
                UpdatedBy = @AdminId
            WHERE EnquiryId = @Id
        `;
    },
};

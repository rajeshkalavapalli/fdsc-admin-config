// SQL for the enquiries list, summary, history and follow-up updates.
// Query text only: each entry returns the SQL string, and enquiryDA.js runs it (sql.NAME()).

// Filters are optional: NULL means "any".
const WHERE = `
    WHERE (@Status IS NULL OR e.Status = @Status)
      AND (@Course IS NULL OR e.Course = @Course)
      AND (@Search IS NULL OR e.Name LIKE @Search OR e.Phone LIKE @Search OR e.Email LIKE @Search)`;

module.exports = {
    LIST: () => `
        SELECT e.EnquiryId, e.Name, e.Phone, e.Email, e.Course, e.Qualification, e.Message, e.Source,
               e.Status, e.Notes, e.CreatedOn, e.UpdatedOn, e.ConsentOn,
               e.EnquiryCount, COALESCE(e.LastEnquiryOn, e.CreatedOn) AS LastEnquiryOn, a.Name AS UpdatedByName
        FROM dbo.Enquiries e
        LEFT JOIN dbo.Admins a ON a.AdminId = e.UpdatedBy
        ${WHERE}
        ORDER BY COALESCE(e.LastEnquiryOn, e.CreatedOn) DESC, e.EnquiryId DESC
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY`,
    COUNT: () => `SELECT COUNT(*) AS Total FROM dbo.Enquiries e ${WHERE}`,
    SUMMARY: () => `
        SELECT Status, COUNT(*) AS Count FROM dbo.Enquiries GROUP BY Status;
        SELECT COUNT(*) AS Today FROM dbo.Enquiries WHERE COALESCE(LastEnquiryOn, CreatedOn) >= CAST(SYSUTCDATETIME() AS date);`,
    // Later enquiries from the same person that were merged into this one (newest first).
    REPEATS: () => `
        SELECT RepeatId, Name, Email, Course, Qualification, Message, CreatedOn
        FROM dbo.EnquiryRepeats WHERE EnquiryId = @Id ORDER BY CreatedOn DESC`,
    UPDATE: () => `
        UPDATE dbo.Enquiries
        SET Status = COALESCE(@Status, Status),
            Notes = CASE WHEN @NotesSet = 1 THEN @Notes ELSE Notes END,
            UpdatedOn = SYSUTCDATETIME(), UpdatedBy = @AdminId
        WHERE EnquiryId = @Id`,
};

UPDATE ai_desktop_content_draft_history
SET payload_json = (
  SELECT drafts.payload_json
  FROM ai_desktop_content_drafts AS drafts
  WHERE drafts.draft_key = ai_desktop_content_draft_history.draft_key
    AND drafts.revision = ai_desktop_content_draft_history.revision
)
WHERE payload_json IS NULL
  AND EXISTS (
    SELECT 1
    FROM ai_desktop_content_drafts AS drafts
    WHERE drafts.draft_key = ai_desktop_content_draft_history.draft_key
      AND drafts.revision = ai_desktop_content_draft_history.revision
  );

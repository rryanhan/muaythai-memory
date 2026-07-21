DO $$
DECLARE
  retired_tag_id uuid;
  target_tag_id uuid;
BEGIN
  SELECT id INTO retired_tag_id
  FROM tags
  WHERE slug = 'switch-step' AND user_id IS NULL
  LIMIT 1;

  SELECT id INTO target_tag_id
  FROM tags
  WHERE slug = 'stance-switch' AND user_id IS NULL
  LIMIT 1;

  IF retired_tag_id IS NOT NULL AND target_tag_id IS NULL THEN
    RAISE EXCEPTION 'Cannot retire switch-step because stance-switch is missing';
  END IF;

  IF retired_tag_id IS NOT NULL THEN
    INSERT INTO drill_tags (drill_id, tag_id, created_at)
    SELECT drill_id, target_tag_id, created_at
    FROM drill_tags
    WHERE tag_id = retired_tag_id
    ON CONFLICT (drill_id, tag_id) DO NOTHING;

    DELETE FROM drill_tags
    WHERE tag_id = retired_tag_id;

    UPDATE tags
    SET active = false, updated_at = now()
    WHERE id = retired_tag_id;
  END IF;
END $$;

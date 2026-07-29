-- Step 70: Visual Editor 0 — Data model & types
-- Target: shared schema in polyaccess database
--
-- Creates the visual_forms table that stores form definitions designed
-- in the visual drag-and-drop form builder. This is separate from the
-- legacy Access form definitions in shared.objects.
--
-- Migration: idempotent (IF NOT EXISTS, ON CONFLICT)

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- 1. visual_forms table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS shared.visual_forms (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  caption         VARCHAR(255),
  record_source   TEXT,
  allow_edits     BOOLEAN NOT NULL DEFAULT true,
  allow_additions BOOLEAN NOT NULL DEFAULT true,
  allow_deletions BOOLEAN NOT NULL DEFAULT true,
  navigation_buttons BOOLEAN NOT NULL DEFAULT true,
  modal           BOOLEAN NOT NULL DEFAULT false,
  popup           BOOLEAN NOT NULL DEFAULT false,
  filter          TEXT,
  order_by        TEXT,
  sections        JSONB NOT NULL DEFAULT '{}'::jsonb,
  editor_settings JSONB,
  events          JSONB,
  module          TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  company_id      INTEGER NOT NULL DEFAULT 1,
  created_by      VARCHAR(100),
  updated_by      VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE shared.visual_forms IS
  'Form definitions created in the visual drag-and-drop form builder. Separate from legacy Access forms in shared.objects.';

COMMENT ON COLUMN shared.visual_forms.name IS 'Unique form name used for navigation routing.';
COMMENT ON COLUMN shared.visual_forms.caption IS 'Human-readable form caption displayed in the title bar.';
COMMENT ON COLUMN shared.visual_forms.record_source IS 'The table name or SQL query providing the form data.';
COMMENT ON COLUMN shared.visual_forms.sections IS 'JSONB containing the header, detail, and footer sections with controls.';
COMMENT ON COLUMN shared.visual_forms.editor_settings IS 'JSONB containing canvas settings: grid size, snap-to-grid, show grid, zoom level.';
COMMENT ON COLUMN shared.visual_forms.events IS 'JSONB map of form-level event handler bindings.';
COMMENT ON COLUMN shared.visual_forms.module IS 'Form-level VBA or script code.';
COMMENT ON COLUMN shared.visual_forms.version IS 'Optimistic concurrency version — incremented on each update.';

-- Unique constraint on name (per company)
CREATE UNIQUE INDEX IF NOT EXISTS idx_visual_forms_name
  ON shared.visual_forms (company_id, name);

-- Index for listing forms
CREATE INDEX IF NOT EXISTS idx_visual_forms_updated
  ON shared.visual_forms (updated_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION shared.trigger_set_visual_form_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_visual_forms_updated ON shared.visual_forms;
CREATE TRIGGER trg_visual_forms_updated
  BEFORE UPDATE ON shared.visual_forms
  FOR EACH ROW
  EXECUTE FUNCTION shared.trigger_set_visual_form_updated();

-- ═══════════════════════════════════════════════════════════════
-- 2. Helper: fn_visual_forms() — returns form list with metadata
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION shared.fn_visual_forms(
  p_company_id INTEGER DEFAULT 1
)
RETURNS TABLE(
  id            INTEGER,
  name          VARCHAR(255),
  caption       VARCHAR(255),
  record_source TEXT,
  version       INTEGER,
  updated_at    TIMESTAMPTZ,
  updated_by    VARCHAR(100)
)
LANGUAGE sql STABLE
AS $$
  SELECT
    vf.id, vf.name, vf.caption, vf.record_source,
    vf.version, vf.updated_at, vf.updated_by
  FROM shared.visual_forms vf
  WHERE vf.company_id = p_company_id
  ORDER BY vf.name;
$$;

COMMENT ON FUNCTION shared.fn_visual_forms IS
  'Return the list of visual form definitions with metadata for the form browser.';

-- ═══════════════════════════════════════════════════════════════
-- 3. Helper: fn_get_visual_form() — returns full form definition
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION shared.fn_get_visual_form(
  p_name        VARCHAR(255),
  p_company_id  INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
  SELECT jsonb_build_object(
    'name',              vf.name,
    'caption',           vf.caption,
    'recordSource',      vf.record_source,
    'allowEdits',        vf.allow_edits,
    'allowAdditions',    vf.allow_additions,
    'allowDeletions',    vf.allow_deletions,
    'navigationButtons', vf.navigation_buttons,
    'modal',             vf.modal,
    'popup',             vf.popup,
    'filter',            vf.filter,
    'orderBy',           vf.order_by,
    'header',            (vf.sections->>'header')::jsonb,
    'detail',            (vf.sections->>'detail')::jsonb,
    'footer',            (vf.sections->>'footer')::jsonb,
    'editorSettings',    vf.editor_settings,
    'events',            vf.events,
    'module',            vf.module,
    'version',           vf.version,
    'createdAt',         vf.created_at,
    'updatedAt',         vf.updated_at,
    'createdBy',         vf.created_by,
    'updatedBy',         vf.updated_by
  )
  FROM shared.visual_forms vf
  WHERE vf.name = p_name
    AND vf.company_id = p_company_id;
$$;

COMMENT ON FUNCTION shared.fn_get_visual_form IS
  'Return the full form definition JSONB for a named visual form.';

-- ═══════════════════════════════════════════════════════════════
-- 4. Helper: fn_save_visual_form() — upsert form definition
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION shared.fn_save_visual_form(
  p_name              VARCHAR(255),
  p_caption           VARCHAR(255) DEFAULT NULL,
  p_record_source     TEXT DEFAULT NULL,
  p_allow_edits       BOOLEAN DEFAULT true,
  p_allow_additions   BOOLEAN DEFAULT true,
  p_allow_deletions   BOOLEAN DEFAULT true,
  p_nav_buttons       BOOLEAN DEFAULT true,
  p_modal             BOOLEAN DEFAULT false,
  p_popup             BOOLEAN DEFAULT false,
  p_filter            TEXT DEFAULT NULL,
  p_order_by          TEXT DEFAULT NULL,
  p_sections          JSONB DEFAULT '{}',
  p_editor_settings   JSONB DEFAULT NULL,
  p_events            JSONB DEFAULT NULL,
  p_module            TEXT DEFAULT NULL,
  p_expected_version  INTEGER DEFAULT NULL,
  p_company_id        INTEGER DEFAULT 1,
  p_username          VARCHAR(100) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_version INTEGER;
  v_new_version     INTEGER;
  v_result          JSONB;
BEGIN
  -- Check if form exists and validate version
  SELECT version INTO v_current_version
  FROM shared.visual_forms
  WHERE name = p_name AND company_id = p_company_id;

  IF FOUND THEN
    -- Update existing — check optimistic lock
    IF p_expected_version IS NOT NULL AND v_current_version != p_expected_version THEN
      RAISE EXCEPTION 'Version conflict: expected %, current %', p_expected_version, v_current_version
        USING ERRCODE = 'P0001';
    END IF;

    v_new_version := v_current_version + 1;

    UPDATE shared.visual_forms
    SET
      caption           = COALESCE(p_caption, caption),
      record_source     = COALESCE(p_record_source, record_source),
      allow_edits       = p_allow_edits,
      allow_additions   = p_allow_additions,
      allow_deletions   = p_allow_deletions,
      navigation_buttons = p_nav_buttons,
      modal             = p_modal,
      popup             = p_popup,
      filter            = p_filter,
      order_by          = p_order_by,
      sections          = p_sections,
      editor_settings   = p_editor_settings,
      events            = p_events,
      module            = p_module,
      version           = v_new_version,
      updated_by        = p_username
    WHERE name = p_name AND company_id = p_company_id;

    v_result := jsonb_build_object('success', true, 'version', v_new_version);
  ELSE
    -- Insert new
    INSERT INTO shared.visual_forms (
      name, caption, record_source,
      allow_edits, allow_additions, allow_deletions,
      navigation_buttons, modal, popup,
      filter, order_by, sections,
      editor_settings, events, module,
      version, company_id, created_by, updated_by
    ) VALUES (
      p_name, p_caption, p_record_source,
      p_allow_edits, p_allow_additions, p_allow_deletions,
      p_nav_buttons, p_modal, p_popup,
      p_filter, p_order_by, p_sections,
      p_editor_settings, p_events, p_module,
      1, p_company_id, p_username, p_username
    );

    v_result := jsonb_build_object('success', true, 'version', 1);
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION shared.fn_save_visual_form IS
  'Upsert a visual form definition with optimistic concurrency control.';

-- ═══════════════════════════════════════════════════════════════
-- 5. Helper: fn_delete_visual_form() — delete a form
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION shared.fn_delete_visual_form(
  p_name        VARCHAR(255),
  p_company_id  INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM shared.visual_forms
  WHERE name = p_name AND company_id = p_company_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

COMMENT ON FUNCTION shared.fn_delete_visual_form IS
  'Delete a visual form definition. Returns true if a row was deleted.';

COMMIT;
-- Email templates and campaign send tracking

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  preview_text TEXT,
  from_name TEXT,
  from_email TEXT NOT NULL DEFAULT 'email@ravenlia.com',
  reply_to TEXT,
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_created_at ON email_templates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_templates_is_archived ON email_templates(is_archived);

DROP TRIGGER IF EXISTS update_email_templates_updated_at ON email_templates;
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage email templates" ON email_templates;
CREATE POLICY "Admins can manage email templates" ON email_templates
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE TABLE IF NOT EXISTS email_campaign_sends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  template_name TEXT,
  subject TEXT NOT NULL,
  recipient_source TEXT NOT NULL CHECK (recipient_source IN ('customers_with_email', 'manual')),
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('sent', 'partial', 'failed')),
  failure_reason TEXT,
  initiated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_campaign_sends_created_at ON email_campaign_sends(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_campaign_sends_template_id ON email_campaign_sends(template_id);

ALTER TABLE email_campaign_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read campaign sends" ON email_campaign_sends;
CREATE POLICY "Admins can read campaign sends" ON email_campaign_sends
  FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "Admins can insert campaign sends" ON email_campaign_sends;
CREATE POLICY "Admins can insert campaign sends" ON email_campaign_sends
  FOR INSERT
  WITH CHECK (is_admin());

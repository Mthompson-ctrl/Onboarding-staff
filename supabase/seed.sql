-- =============================================================================
-- Seed — system-global document types (organisation_id IS NULL)
-- Idempotent on (code) where organisation_id IS NULL.
-- =============================================================================

INSERT INTO document_types (
  code, name, description,
  required_by_default, has_expiry, captures_state, captures_reference_number,
  display_order
) VALUES
  ('ndis_worker_screening_check',
   'NDIS Worker Screening Check',
   'Federal clearance issued by the NDIS Quality and Safeguards Commission. Mandatory for all NDIS workers in risk-assessed roles.',
   true,  true,  false, true,  10),

  ('working_with_children_check',
   'Working with Children Check',
   'State-issued check; renewal periods vary by state. Capture issuing state.',
   true,  true,  true,  true,  20),

  ('national_police_check',
   'National Police Check',
   'National Police Certificate via the Australian Federal Police or accredited body. The expiry recorded on uploads reflects provider freshness policy (typically 12 months from issue), not an expiry on the certificate itself.',
   true,  true,  false, true,  30),

  ('first_aid_certificate',
   'First Aid Certificate',
   'HLTAID011 Provide First Aid (or equivalent). Renewal typically every 3 years.',
   true,  true,  false, true,  40),

  ('cpr_certificate',
   'CPR Certificate',
   'HLTAID009 Provide Cardiopulmonary Resuscitation. Renewal typically annual.',
   true,  true,  false, true,  50),

  ('ndis_worker_orientation',
   'NDIS Worker Orientation Module',
   '"Quality, Safety and You" — completion certificate from the NDIS Commission. One-off.',
   true,  false, false, true,  60),

  ('drivers_licence',
   'Driver''s Licence',
   'Australian state-issued driver''s licence. Required for community-access / transport roles.',
   false, true,  true,  true,  70),

  ('vehicle_insurance',
   'Vehicle Insurance',
   'Comprehensive or CTP, in candidate''s name. Required when using own vehicle for work.',
   false, true,  false, true,  80),

  ('cert_iii_individual_support',
   'Certificate III in Individual Support',
   'CHC33015 (or successor). Common entry-level qualification for support workers.',
   false, false, false, true,  90),

  ('cert_iv_individual_support',
   'Certificate IV in Individual Support',
   'CHC43015 (or successor).',
   false, false, false, true, 100),

  ('cert_iv_disability',
   'Certificate IV in Disability',
   'CHC43115 (or successor).',
   false, false, false, true, 110),

  ('cert_iv_ageing_support',
   'Certificate IV in Ageing Support',
   'CHC43015 (or successor).',
   false, false, false, true, 120)
ON CONFLICT DO NOTHING;

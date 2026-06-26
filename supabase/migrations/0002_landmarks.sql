-- Add landmarks (corroborating area detail) to each identified property.
alter table lead_properties add column if not exists landmarks text;

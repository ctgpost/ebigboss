ALTER TABLE public.shop_settings
ALTER COLUMN shop_address SET DEFAULT '৫ নং গলি, Shop No-13, New Market, Karanihat, Satkania, Chittagong';

UPDATE public.shop_settings
SET shop_address = regexp_replace(
  COALESCE(shop_address, ''),
  '(Goli No-|গলি নং-|গলি নাম্বার-|গলি )6|(Goli No-|গলি নং-|গলি নাম্বার-|গলি )৬',
  '৫ নং গলি',
  'gi'
)
WHERE shop_address ILIKE '%Goli No-6%'
   OR shop_address LIKE '%গলি ৬%'
   OR shop_address LIKE '%গলি নং-৬%'
   OR shop_address LIKE '%গলি নাম্বার-৬%';
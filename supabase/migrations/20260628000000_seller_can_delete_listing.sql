CREATE POLICY "seller_can_delete_own_listing"
  ON public.marketplace_listings
  FOR DELETE
  USING (auth.uid() = seller_id);

-- Update handle_new_user to generate a random callsign
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
DECLARE
  generated_callsign text;
BEGIN
  -- Generate a callsign like "Operator-a1b2c3"
  generated_callsign := 'Operator-' || substr(md5(random()::text), 1, 6);

  INSERT INTO public.profiles (id, callsign)
  VALUES (new.id, generated_callsign);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create budgets table
CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category text NOT NULL,
  amount_limit integer NOT NULL, -- Stored in cents
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, category)
);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own budgets" 
ON public.budgets FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER handle_updated_at_budgets
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- Create achievements catalog
CREATE TABLE public.achievements (
  id text PRIMARY KEY,
  title text NOT NULL,
  sub text NOT NULL,
  points integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Insert initial static achievements
INSERT INTO public.achievements (id, title, sub, points)
VALUES 
  ('1', 'Ledger initiated', 'First login', 100),
  ('2', 'Capital injection', 'First deposit logged', 50);

-- Achievements catalog should be readable by all authenticated users
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read achievements" 
ON public.achievements FOR SELECT USING (auth.role() = 'authenticated');

-- Create user_achievements table to track unlocks
CREATE TABLE public.user_achievements (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  achievement_id text REFERENCES public.achievements(id) ON DELETE CASCADE NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own achievements" 
ON public.user_achievements FOR ALL USING (auth.uid() = user_id);

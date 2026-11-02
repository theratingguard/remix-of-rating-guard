begin;

with locations (country_slug, country_name, city_slug, city_name) as (
  values
    ('united-states', 'United States', 'new-york', 'New York'),
    ('united-states', 'United States', 'los-angeles', 'Los Angeles'),
    ('united-states', 'United States', 'chicago', 'Chicago'),
    ('united-states', 'United States', 'houston', 'Houston'),
    ('united-states', 'United States', 'miami', 'Miami'),
    ('united-kingdom', 'United Kingdom', 'london', 'London'),
    ('united-kingdom', 'United Kingdom', 'manchester', 'Manchester'),
    ('united-kingdom', 'United Kingdom', 'birmingham', 'Birmingham'),
    ('united-kingdom', 'United Kingdom', 'glasgow', 'Glasgow'),
    ('united-kingdom', 'United Kingdom', 'bristol', 'Bristol'),
    ('india', 'India', 'mumbai', 'Mumbai'),
    ('india', 'India', 'delhi', 'Delhi'),
    ('india', 'India', 'bengaluru', 'Bengaluru'),
    ('india', 'India', 'hyderabad', 'Hyderabad'),
    ('india', 'India', 'chennai', 'Chennai'),
    ('canada', 'Canada', 'toronto', 'Toronto'),
    ('canada', 'Canada', 'vancouver', 'Vancouver'),
    ('canada', 'Canada', 'montreal', 'Montreal'),
    ('canada', 'Canada', 'calgary', 'Calgary'),
    ('canada', 'Canada', 'ottawa', 'Ottawa'),
    ('australia', 'Australia', 'sydney', 'Sydney'),
    ('australia', 'Australia', 'melbourne', 'Melbourne'),
    ('australia', 'Australia', 'brisbane', 'Brisbane'),
    ('australia', 'Australia', 'perth', 'Perth'),
    ('australia', 'Australia', 'adelaide', 'Adelaide'),
    ('france', 'France', 'paris', 'Paris'),
    ('france', 'France', 'marseille', 'Marseille'),
    ('france', 'France', 'lyon', 'Lyon'),
    ('france', 'France', 'toulouse', 'Toulouse'),
    ('france', 'France', 'nice', 'Nice'),
    ('germany', 'Germany', 'berlin', 'Berlin'),
    ('germany', 'Germany', 'hamburg', 'Hamburg'),
    ('germany', 'Germany', 'munich', 'Munich'),
    ('germany', 'Germany', 'cologne', 'Cologne'),
    ('germany', 'Germany', 'frankfurt', 'Frankfurt'),
    ('spain', 'Spain', 'madrid', 'Madrid'),
    ('spain', 'Spain', 'barcelona', 'Barcelona'),
    ('spain', 'Spain', 'valencia', 'Valencia'),
    ('spain', 'Spain', 'seville', 'Seville'),
    ('spain', 'Spain', 'malaga', 'Malaga'),
    ('brazil', 'Brazil', 'sao-paulo', 'Sao Paulo'),
    ('brazil', 'Brazil', 'rio-de-janeiro', 'Rio de Janeiro'),
    ('brazil', 'Brazil', 'brasilia', 'Brasilia'),
    ('brazil', 'Brazil', 'salvador', 'Salvador'),
    ('brazil', 'Brazil', 'curitiba', 'Curitiba'),
    ('japan', 'Japan', 'tokyo', 'Tokyo'),
    ('japan', 'Japan', 'osaka', 'Osaka'),
    ('japan', 'Japan', 'kyoto', 'Kyoto'),
    ('japan', 'Japan', 'yokohama', 'Yokohama'),
    ('japan', 'Japan', 'sapporo', 'Sapporo'),
    ('united-arab-emirates', 'United Arab Emirates', 'dubai', 'Dubai'),
    ('united-arab-emirates', 'United Arab Emirates', 'abu-dhabi', 'Abu Dhabi'),
    ('united-arab-emirates', 'United Arab Emirates', 'sharjah', 'Sharjah'),
    ('united-arab-emirates', 'United Arab Emirates', 'ajman', 'Ajman'),
    ('united-arab-emirates', 'United Arab Emirates', 'al-ain', 'Al Ain'),
    ('mexico', 'Mexico', 'mexico-city', 'Mexico City'),
    ('mexico', 'Mexico', 'guadalajara', 'Guadalajara'),
    ('mexico', 'Mexico', 'monterrey', 'Monterrey'),
    ('mexico', 'Mexico', 'puebla', 'Puebla'),
    ('mexico', 'Mexico', 'merida', 'Merida'),
    ('italy', 'Italy', 'rome', 'Rome'),
    ('italy', 'Italy', 'milan', 'Milan'),
    ('italy', 'Italy', 'naples', 'Naples'),
    ('italy', 'Italy', 'turin', 'Turin'),
    ('italy', 'Italy', 'florence', 'Florence'),
    ('netherlands', 'Netherlands', 'amsterdam', 'Amsterdam'),
    ('netherlands', 'Netherlands', 'rotterdam', 'Rotterdam'),
    ('netherlands', 'Netherlands', 'the-hague', 'The Hague'),
    ('netherlands', 'Netherlands', 'utrecht', 'Utrecht'),
    ('netherlands', 'Netherlands', 'eindhoven', 'Eindhoven'),
    ('south-korea', 'South Korea', 'seoul', 'Seoul'),
    ('south-korea', 'South Korea', 'busan', 'Busan'),
    ('south-korea', 'South Korea', 'incheon', 'Incheon'),
    ('south-korea', 'South Korea', 'daegu', 'Daegu'),
    ('south-korea', 'South Korea', 'daejeon', 'Daejeon'),
    ('south-africa', 'South Africa', 'johannesburg', 'Johannesburg'),
    ('south-africa', 'South Africa', 'cape-town', 'Cape Town'),
    ('south-africa', 'South Africa', 'durban', 'Durban'),
    ('south-africa', 'South Africa', 'pretoria', 'Pretoria'),
    ('south-africa', 'South Africa', 'port-elizabeth', 'Port Elizabeth'),
    ('new-zealand', 'New Zealand', 'auckland', 'Auckland'),
    ('new-zealand', 'New Zealand', 'wellington', 'Wellington'),
    ('new-zealand', 'New Zealand', 'christchurch', 'Christchurch'),
    ('new-zealand', 'New Zealand', 'hamilton', 'Hamilton'),
    ('new-zealand', 'New Zealand', 'tauranga', 'Tauranga'),
    ('ireland', 'Ireland', 'dublin', 'Dublin'),
    ('ireland', 'Ireland', 'cork', 'Cork'),
    ('ireland', 'Ireland', 'galway', 'Galway'),
    ('ireland', 'Ireland', 'limerick', 'Limerick'),
    ('ireland', 'Ireland', 'waterford', 'Waterford'),
    ('singapore', 'Singapore', 'central-area', 'Central Area'),
    ('singapore', 'Singapore', 'jurong-east', 'Jurong East'),
    ('singapore', 'Singapore', 'woodlands', 'Woodlands'),
    ('singapore', 'Singapore', 'tampines', 'Tampines'),
    ('singapore', 'Singapore', 'queenstown', 'Queenstown'),
    ('sweden', 'Sweden', 'stockholm', 'Stockholm'),
    ('sweden', 'Sweden', 'gothenburg', 'Gothenburg'),
    ('sweden', 'Sweden', 'malmo', 'Malmo'),
    ('sweden', 'Sweden', 'uppsala', 'Uppsala'),
    ('sweden', 'Sweden', 'vasteras', 'Vasteras')
),
page_content as (
  select
    country_slug,
    country_name,
    city_slug,
    city_name,
    jsonb_build_object(
      'intro',
      format(
        'This draft provides general information for businesses in %s, %s about assessing Google review concerns and organizing evidence. It does not claim that Rating Guard has an office or locally verified service coverage here. Google applies its own policies and makes all decisions about reviews.',
        city_name,
        country_name
      ),
      'sections',
      jsonb_build_array(
        jsonb_build_object(
          'heading', 'Assess the review against the published policy',
          'body',
          format(
            'A negative review or disagreement about a customer experience is not, by itself, proof that a review violates a platform policy. Businesses in %s should compare the specific review and available evidence with the current official Google Maps user-contributed content policy before deciding whether to report it.',
            city_name
          )
        ),
        jsonb_build_object(
          'heading', 'Keep evidence factual and organized',
          'body',
          format(
            'Record the review URL, relevant dates, and a concise explanation of the policy concern. Keep original records secure and separate confirmed facts from assumptions. Avoid sharing personal information publicly, contacting reviewers in a threatening way, or asking anyone to post misleading responses.',
            city_name
          )
        ),
        jsonb_build_object(
          'heading', 'Use the official review process',
          'body',
          format(
            'If the evidence supports a specific policy concern, use the reporting and appeal options available in the business profile. Outcomes and response times are determined by Google and are not guaranteed. This general guidance applies in %s as elsewhere; it is not legal advice or a promise of removal.',
            city_name
          )
        )
      ),
      'faqs',
      jsonb_build_array(
        jsonb_build_object(
          'question', format('Can a review be removed in %s?', city_name),
          'answer',
          'Only Google decides whether content violates its policies. A report or appeal does not guarantee removal.'
        )
      )
    ) as page_content
  from locations
)
insert into public.review_location_pages (
  country_slug,
  city_slug,
  country_name,
  city_name,
  locale,
  description,
  page_content,
  status,
  published_at
)
select
  country_slug,
  city_slug,
  country_name,
  city_name,
  'en-US',
  format(
    'Guidance for businesses in %s, %s on review policy concerns and evidence. Google makes all review decisions.',
    city_name,
    country_name
  ),
  page_content,
  'draft',
  null
from page_content
on conflict (country_slug, city_slug) do nothing;

commit;

// Editable lists for the form's dropdowns.

// Programmes offered in the "Programme" dropdown ("Other" is added automatically).
export const PROGRAMMES = ['BA Interaction Design', 'MA Interaction Design'];

// Country calling codes: likely ones first, then all others alphabetically.
export const COMMON_CODES = [
  ['Switzerland', '+41'],
  ['Germany', '+49'],
  ['Austria', '+43'],
  ['France', '+33'],
  ['Italy', '+39'],
  ['Liechtenstein', '+423'],
];

export const COUNTRY_CODES = [
  ['Afghanistan', '+93'], ['Albania', '+355'], ['Algeria', '+213'], ['Andorra', '+376'], ['Angola', '+244'],
  ['Argentina', '+54'], ['Armenia', '+374'], ['Australia', '+61'], ['Austria', '+43'], ['Azerbaijan', '+994'],
  ['Bahrain', '+973'], ['Bangladesh', '+880'], ['Belarus', '+375'], ['Belgium', '+32'], ['Bolivia', '+591'],
  ['Bosnia and Herzegovina', '+387'], ['Brazil', '+55'], ['Bulgaria', '+359'], ['Cambodia', '+855'], ['Cameroon', '+237'],
  ['Canada', '+1'], ['Chile', '+56'], ['China', '+86'], ['Colombia', '+57'], ['Costa Rica', '+506'],
  ['Croatia', '+385'], ['Cuba', '+53'], ['Cyprus', '+357'], ['Czechia', '+420'], ['Denmark', '+45'],
  ['Dominican Republic', '+1'], ['Ecuador', '+593'], ['Egypt', '+20'], ['El Salvador', '+503'], ['Estonia', '+372'],
  ['Ethiopia', '+251'], ['Finland', '+358'], ['France', '+33'], ['Georgia', '+995'], ['Germany', '+49'],
  ['Ghana', '+233'], ['Greece', '+30'], ['Guatemala', '+502'], ['Honduras', '+504'], ['Hong Kong', '+852'],
  ['Hungary', '+36'], ['Iceland', '+354'], ['India', '+91'], ['Indonesia', '+62'], ['Iran', '+98'],
  ['Iraq', '+964'], ['Ireland', '+353'], ['Israel', '+972'], ['Italy', '+39'], ['Ivory Coast', '+225'],
  ['Jamaica', '+1'], ['Japan', '+81'], ['Jordan', '+962'], ['Kazakhstan', '+7'], ['Kenya', '+254'],
  ['Kosovo', '+383'], ['Kuwait', '+965'], ['Kyrgyzstan', '+996'], ['Latvia', '+371'], ['Lebanon', '+961'],
  ['Libya', '+218'], ['Liechtenstein', '+423'], ['Lithuania', '+370'], ['Luxembourg', '+352'], ['Macau', '+853'],
  ['Malaysia', '+60'], ['Malta', '+356'], ['Mexico', '+52'], ['Moldova', '+373'], ['Monaco', '+377'],
  ['Mongolia', '+976'], ['Montenegro', '+382'], ['Morocco', '+212'], ['Mozambique', '+258'], ['Myanmar', '+95'],
  ['Nepal', '+977'], ['Netherlands', '+31'], ['New Zealand', '+64'], ['Nicaragua', '+505'], ['Nigeria', '+234'],
  ['North Macedonia', '+389'], ['Norway', '+47'], ['Oman', '+968'], ['Pakistan', '+92'], ['Palestine', '+970'],
  ['Panama', '+507'], ['Paraguay', '+595'], ['Peru', '+51'], ['Philippines', '+63'], ['Poland', '+48'],
  ['Portugal', '+351'], ['Qatar', '+974'], ['Romania', '+40'], ['Russia', '+7'], ['Rwanda', '+250'],
  ['San Marino', '+378'], ['Saudi Arabia', '+966'], ['Senegal', '+221'], ['Serbia', '+381'], ['Singapore', '+65'],
  ['Slovakia', '+421'], ['Slovenia', '+386'], ['South Africa', '+27'], ['South Korea', '+82'], ['Spain', '+34'],
  ['Sri Lanka', '+94'], ['Sudan', '+249'], ['Sweden', '+46'], ['Switzerland', '+41'], ['Syria', '+963'],
  ['Taiwan', '+886'], ['Tajikistan', '+992'], ['Tanzania', '+255'], ['Thailand', '+66'], ['Tunisia', '+216'],
  ['Turkey', '+90'], ['Turkmenistan', '+993'], ['Uganda', '+256'], ['Ukraine', '+380'], ['United Arab Emirates', '+971'],
  ['United Kingdom', '+44'], ['United States', '+1'], ['Uruguay', '+598'], ['Uzbekistan', '+998'], ['Venezuela', '+58'],
  ['Vietnam', '+84'], ['Yemen', '+967'], ['Zambia', '+260'], ['Zimbabwe', '+263'],
];

// Countries where the leading 0 of a number is dialled after the country code.
export const KEEP_LEADING_ZERO = new Set(['+39', '+378']);

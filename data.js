/* ------------------------------------------------------------------ *
 *  Connect Cleaning — pricing data + call-script content
 *  Generated from ConnectCleaning_pricebook_export.csv
 *  Prices are dynamic: the CSR enters square footage and the app
 *  reads the matching range bucket below.
 * ------------------------------------------------------------------ */

/* Home cleaning buckets: [lo, hi, oneTime, initial, weekly, biweekly, monthly, moving] */
const HOME_BUCKETS = [
  [0,1000,425.67,274.34,122.28,161.39,199.59,532.09],
  [1001,1300,440.29,286.88,131.14,173.31,211.81,550.37],
  [1301,1600,454.92,299.41,139.99,185.22,224.03,568.65],
  [1601,1900,469.54,318.44,152.13,201.45,241.3,586.92],
  [1901,2200,484.16,331.24,161.18,213.61,253.78,605.2],
  [2201,2500,498.78,344.03,170.23,225.78,266.27,623.48],
  [2501,2800,513.41,356.82,179.28,237.95,278.75,641.76],
  [2801,3100,528.03,369.62,188.32,250.12,291.23,660.03],
  [3101,3400,542.65,399.58,206.77,274.67,317.69,678.31],
  [3401,3700,577.27,412.95,216.25,287.41,330.74,696.59],
  [3701,4000,571.89,426.32,225.73,300.15,343.8,714.87],
  [4001,4300,586.52,439.69,235.2,312.89,356.85,733.15],
  [4301,4600,601.14,453.06,244.68,325.64,369.91,751.42],
  [4601,4900,615.76,466.43,254.16,338.38,382.97,769.7],
  [4901,5200,630.38,479.8,263.64,351.12,396.02,787.98],
  [5201,5500,645.01,493.17,273.21,363.86,409.08,806.26],
  [5501,5800,659.63,506.54,282.6,376.61,422.13,824.54],
  [5801,6100,674.25,519.9,292.07,389.35,435.19,842.81],
  [6101,6400,688.87,533.27,301.55,402.09,448.24,861.09],
  [6401,6700,703.5,546.64,311.03,414.83,461.3,879.37],
  [6701,7000,718.12,560.01,320.51,427.57,474.35,897.65],
  [7001,7300,732.74,573.38,329.99,440.32,487.41,915.92],
  [7301,7600,747.36,586.75,339.47,453.06,500.47,934.2],
  [7601,7900,761.98,600.12,348.94,465.8,513.52,952.48],
  [7901,8200,776.61,613.49,358.42,478.54,526.58,970.76],
  [8201,8500,791.23,626.86,367.9,491.29,539.63,989.04],
  [8501,8800,805.85,640.22,377.38,504.03,539.63,1007.31],
  [8801,9100,820.47,653.59,386.86,516.77,565.74,1025.59],
  [9101,9400,835.1,666.96,396.34,529.51,578.8,1043.87],
  [9401,9700,849.72,680.33,405.82,542.26,591.86,1062.15],
  [9701,10000,849.72,680.33,405.82,542.26,604.91,1062.15],
  [10001,10300,878.96,707.07,424.77,567.74,617.97,1098.7],
  [10301,10600,893.59,720.44,434.25,580.48,631.02,1116.98],
  [10601,10900,908.21,733.81,443.73,593.22,644.08,1135.26],
  [10901,11200,922.83,747.18,453.21,605.97,657.13,1153.54],
  [11201,11500,937.45,760.55,462.69,618.71,670.19,1171.81]
];

const HOME_SERVICE_INDEX = { oneTime:2, initial:3, weekly:4, biweekly:5, monthly:6, moving:7 };

/* Window packages — price per sq ft, $197 minimum job */
const WINDOW = {
  min: 197,
  packages: {
    gold:   { rate: 0.40, label: 'Gold',   blurb: 'Interior + exterior, screens removed & cleaned, tracks cleaned, sills & frames detailed, PLUS whole-house soft wash.' },
    silver: { rate: 0.19, label: 'Silver', blurb: 'Interior + exterior, screens cleaned, sills & frames. No tracks, no soft wash. (Most popular — recommend this one.)' },
    bronze: { rate: 0.10, label: 'Bronze', blurb: 'Exterior windows + screens only. No interior. Curb view.' }
  }
};

/* Optional add-ons pulled from the pricebook */
const ADDONS = [
  { key:'grill',  label:'Grill Deep-Cleaning',      price:75 },
  { key:'fridge', label:'Fridge Interior Cleaning',  price:40 },
  { key:'oven',   label:'Oven Interior Cleaning',    price:40 }
];

/* Pain points → empathy + benefit fragments used to rephrase the bridge/close.
   Each fragment is written to slot into: "I know you've been ___" / "so you can ___". */
const PAIN_POINTS = [
  { key:'guests',   label:'Hosting guests / event',      empathy:"getting ready for company",                     benefit:"greet your guests in a home you're proud of instead of scrambling the night before" },
  { key:'listing',  label:'Selling / listing the home',  empathy:"getting the house ready to list",                benefit:"show it at its absolute best and get it off your plate" },
  { key:'baby',     label:'New baby',                     empathy:"adjusting to life with a new baby",              benefit:"soak up that time with the little one instead of worrying about the housework" },
  { key:'surgery',  label:'Surgery / injury recovery',   empathy:"recovering",                                     benefit:"rest and heal without pushing yourself on things you shouldn't be doing right now" },
  { key:'parent',   label:'Caring for a parent',         empathy:"caring for your mom",                             benefit:"be present for the people who need you instead of stretched thin" },
  { key:'busy',     label:'Busy with work',              empathy:"slammed with work",                              benefit:"get your evenings and weekends back" },
  { key:'behind',   label:'Overwhelmed / fell behind',   empathy:"feeling like it's gotten away from you a bit",   benefit:"walk in the door and finally exhale" },
  { key:'moving',   label:'Moving / move-out / turnover', empathy:"in the middle of a move",                        benefit:"cross the cleaning off your moving list, whether you're settling in or handing over the keys" },
  { key:'health',   label:'Health / allergies',          empathy:"dealing with the dust and allergens",            benefit:"breathe easier in a home that's genuinely clean, not just tidy" },
  { key:'pets',     label:'Pets / pet hair',             empathy:"keeping up with the pet hair",                   benefit:"stop fighting the fur and enjoy your pets instead" }
];

/* Keyword hints so a free-typed phrase ("upcoming knee surgery") maps to a pain point */
const PAIN_KEYWORDS = [
  [/knee|hip|surgery|surger|operation|injur|recover|hospital|broke|cast|back pain/i, 'surgery'],
  [/baby|newborn|pregnan|infant|maternit/i, 'baby'],
  [/guest|party|event|holiday|thanksgiving|christmas|host|company coming|family coming|visit/i, 'guests'],
  [/sell|selling|listing|list the|realtor|market the|showing/i, 'listing'],
  [/mom|dad|mother|father|parent|elderly|caregiver|caring for/i, 'parent'],
  [/work|busy|slammed|swamped|overtime|travel for/i, 'busy'],
  [/behind|overwhelm|piled|pile up|got away|can't keep up|falling behind|too much/i, 'behind'],
  [/mov(e|ing)|relocat|new house|new home|move-in|move out/i, 'moving'],
  [/allerg|asthma|dust|health|immune|sick/i, 'health'],
  [/dog|cat|pet|fur|hair|shedd/i, 'pets']
];

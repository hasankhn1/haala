/**
 * Seed catalogue for local development.
 *
 * Product photography is hot-linked from **Wikimedia Commons** thumbnails —
 * freely licensed, stable URLs, no API key. A few items have no usable Commons
 * photo and carry `imageUrl: null`; the apps fall back to the emoji/tint
 * placeholder in `@haala/ui`'s `Thumb`, so a missing image is never a broken
 * layout.
 *
 * Prices are in **whole rupees** here for readability — `seed.ts` converts them
 * to integer paisa via `rupees()` before they touch the database. Editing this
 * file and re-running `db:seed` updates existing rows in place.
 *
 * This is dev data. Once the ops dashboard lands, pricing and stock move to the
 * database as the source of truth and this file becomes first-run bootstrap only.
 */

export interface SeedProduct {
  slug: string;
  name: string;
  /** Display unit, e.g. "1 kg", "12 pcs". */
  unit: string;
  /** Base price in whole PKR (converted to paisa on load). */
  price: number;
  description: string;
  imageUrl: string | null;
}

export interface SeedCategory {
  slug: string;
  name: string;
  imageUrl: string | null;
  products: SeedProduct[];
}

/**
 * Demo accounts. All share the password below — dev convenience only, and the
 * reason this file must never be loaded outside development.
 */
export const SEED_PASSWORD = 'haala1234';

export const SEED_USERS = [
  {
    name: 'Demo Customer',
    phone: '+923001112233',
    email: 'customer@haala.test',
    role: 'customer' as const,
  },
  // `homeStoreCode` is seed-only sugar: it's resolved to a store id and written
  // to `riders.store_id`, which is what scopes the orders each rider is offered.
  {
    name: 'Bilal Ahmed',
    phone: '+923004445566',
    email: null,
    role: 'rider' as const,
    homeStoreCode: 'PEW-DHA',
  },
  {
    name: 'Usman Tariq',
    phone: '+923007778899',
    email: null,
    role: 'rider' as const,
    homeStoreCode: 'PEW-HYT',
  },
  { name: 'Ops Admin', phone: '+923009990000', email: 'admin@haala.test', role: 'admin' as const },
] as const;

/**
 * Dark stores — Peshawar.
 *
 * Coordinates are approximate centres for each area and are the thing that
 * decides serviceability, so verify them against a map before any real pilot;
 * they're editable in the ops dashboard (Stores screen) without a redeploy.
 */
export const SEED_STORES = [
  {
    name: 'Haala — DHA Peshawar',
    code: 'PEW-DHA',
    addressLine: 'Sector B, Commercial Area, DHA Phase 1',
    area: 'DHA Peshawar',
    city: 'Peshawar',
    latitude: 33.9793,
    longitude: 71.6903,
    deliveryRadiusMeters: 6000,
  },
  {
    name: 'Haala — Hayatabad',
    code: 'PEW-HYT',
    addressLine: 'Phase 3, Main Boulevard',
    area: 'Hayatabad',
    city: 'Peshawar',
    latitude: 33.9962,
    longitude: 71.4419,
    deliveryRadiusMeters: 6000,
  },
] as const;

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    slug: 'dry-fruits',
    name: 'Dry Fruits',
    imageUrl: null,
    products: [
      {
        slug: 'almonds',
        name: 'Almonds (Badam)',
        unit: '250 g',
        price: 1250,
        description: 'Whole almonds, graded and sorted.',
        imageUrl: '/static/products/almonds.jpg',
      },
      {
        slug: 'walnuts',
        name: 'Walnuts (Akhrot)',
        unit: '250 g',
        price: 950,
        description: 'Shelled walnut halves from the northern valleys.',
        imageUrl: '/static/products/walnuts.jpg',
      },
      {
        slug: 'pistachios',
        name: 'Pistachios (Pista)',
        unit: '250 g',
        price: 1850,
        description: 'Roasted and salted pistachios.',
        imageUrl: '/static/products/pistachios.jpg',
      },
      {
        slug: 'dried-apricots',
        name: 'Dried Apricots (Khubani)',
        unit: '250 g',
        price: 620,
        description: 'Sun-dried Hunza apricots.',
        imageUrl: '/static/products/dried-apricots.jpg',
      },
      {
        slug: 'raisins',
        name: 'Raisins (Kishmish)',
        unit: '250 g',
        price: 450,
        description: 'Golden seedless raisins.',
        imageUrl: '/static/products/raisins.jpg',
      },
      {
        slug: 'dried-figs',
        name: 'Dried Figs (Anjeer)',
        unit: '250 g',
        price: 1400,
        description: 'Soft dried figs.',
        imageUrl: '/static/products/dried-figs.jpg',
      },
    ],
  },
  {
    slug: 'fruits-vegetables',
    name: 'Fruits & Vegetables',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/K-mart_Fresh_Market_Vegetable_Stall_and_Kai_Bo_Food_Supermarket.jpg/960px-K-mart_Fresh_Market_Vegetable_Stall_and_Kai_Bo_Food_Supermarket.jpg',
    products: [
      {
        slug: 'bananas',
        name: 'Bananas',
        unit: '1 dozen',
        price: 220,
        description: 'Sweet ripe bananas, sold by the dozen.',
        imageUrl: '/static/products/bananas.jpg',
      },
      {
        slug: 'apples-kashmiri',
        name: 'Kashmiri Apples',
        unit: '1 kg',
        price: 380,
        description: 'Crisp red apples, hand-picked and graded.',
        imageUrl: '/static/products/apples-kashmiri.jpg',
      },
      {
        slug: 'mangoes-chaunsa',
        name: 'Chaunsa Mangoes',
        unit: '1 kg',
        price: 450,
        description: "Pakistan's sweetest summer mango.",
        imageUrl: '/static/products/mangoes-chaunsa.jpg',
      },
      {
        slug: 'oranges-kinnow',
        name: 'Kinnow Oranges',
        unit: '1 kg',
        price: 200,
        description: 'Juicy Punjabi kinnow, easy to peel.',
        imageUrl: '/static/products/oranges-kinnow.jpg',
      },
      {
        slug: 'tomatoes',
        name: 'Tomatoes',
        unit: '1 kg',
        price: 160,
        description: 'Firm salad tomatoes, ripened on the vine.',
        imageUrl: '/static/products/tomatoes.jpg',
      },
      {
        slug: 'onions',
        name: 'Onions',
        unit: '1 kg',
        price: 140,
        description: 'Everyday cooking onions.',
        imageUrl: '/static/products/onions.jpg',
      },
      {
        slug: 'potatoes',
        name: 'Potatoes',
        unit: '1 kg',
        price: 120,
        description: 'All-purpose potatoes for curry, fries and roast.',
        imageUrl: '/static/products/potatoes.jpg',
      },
      {
        slug: 'garlic',
        name: 'Garlic',
        unit: '250 g',
        price: 180,
        description: 'Fresh garlic bulbs.',
        imageUrl: '/static/products/garlic.jpg',
      },
      {
        slug: 'ginger',
        name: 'Ginger',
        unit: '250 g',
        price: 200,
        description: 'Aromatic ginger root.',
        imageUrl: '/static/products/ginger.jpg',
      },
      {
        slug: 'green-chillies',
        name: 'Green Chillies',
        unit: '250 g',
        price: 90,
        description: 'Hot green chillies.',
        imageUrl: '/static/products/green-chillies.jpg',
      },
      {
        slug: 'spinach',
        name: 'Spinach (Palak)',
        unit: '1 bunch',
        price: 80,
        description: 'Tender spinach leaves, washed and bunched.',
        imageUrl: '/static/products/spinach.jpg',
      },
      {
        slug: 'coriander',
        name: 'Coriander (Dhania)',
        unit: '1 bunch',
        price: 40,
        description: 'Fresh coriander for garnish and chutney.',
        imageUrl: '/static/products/coriander.jpg',
      },
      {
        slug: 'cucumber',
        name: 'Cucumber',
        unit: '500 g',
        price: 90,
        description: 'Cool, crunchy salad cucumbers.',
        imageUrl: '/static/products/cucumber.jpg',
      },
      {
        slug: 'lemons',
        name: 'Lemons',
        unit: '500 g',
        price: 150,
        description: 'Tart lemons for cooking and drinks.',
        imageUrl: '/static/products/lemons.jpg',
      },
      {
        slug: 'carrots',
        name: 'Carrots',
        unit: '1 kg',
        price: 130,
        description: 'Sweet crunchy carrots.',
        imageUrl: '/static/products/carrots.jpg',
      },
      {
        slug: 'cauliflower',
        name: 'Cauliflower (Gobi)',
        unit: '1 piece',
        price: 120,
        description: 'Tight white cauliflower head.',
        imageUrl: '/static/products/cauliflower.jpg',
      },
      {
        slug: 'okra',
        name: 'Okra (Bhindi)',
        unit: '500 g',
        price: 140,
        description: 'Tender young okra pods.',
        imageUrl: '/static/products/okra.jpg',
      },
      {
        slug: 'green-peas',
        name: 'Green Peas (Matar)',
        unit: '500 g',
        price: 180,
        description: 'Sweet green peas.',
        imageUrl: '/static/products/green-peas.jpg',
      },
    ],
  },
  {
    slug: 'dairy-eggs',
    name: 'Dairy & Eggs',
    imageUrl: null,
    products: [
      {
        slug: 'fresh-milk',
        name: 'Fresh Milk',
        unit: '1 L',
        price: 210,
        description: 'Daily fresh full-cream milk.',
        imageUrl: '/static/products/fresh-milk.jpg',
      },
      {
        slug: 'packaged-milk',
        name: 'Full Cream Milk (Packaged)',
        unit: '1 L',
        price: 240,
        description: 'UHT full-cream milk, long life.',
        imageUrl: '/static/products/packaged-milk.jpg',
      },
      {
        slug: 'yogurt',
        name: 'Yogurt (Dahi)',
        unit: '500 g',
        price: 180,
        description: 'Thick set natural yogurt.',
        imageUrl: '/static/products/yogurt.jpg',
      },
      {
        slug: 'butter',
        name: 'Butter',
        unit: '200 g',
        price: 480,
        description: 'Creamy salted butter.',
        imageUrl: '/static/products/butter.jpg',
      },
      {
        slug: 'cheddar-cheese',
        name: 'Cheddar Cheese',
        unit: '200 g',
        price: 650,
        description: 'Matured cheddar, great for toasties.',
        imageUrl: '/static/products/cheddar-cheese.jpg',
      },
      {
        slug: 'eggs-dozen',
        name: 'Eggs',
        unit: '12 pcs',
        price: 360,
        description: 'Farm eggs, medium size.',
        imageUrl: '/static/products/eggs-dozen.jpg',
      },
      {
        slug: 'cream',
        name: 'Fresh Cream',
        unit: '200 ml',
        price: 260,
        description: 'Rich pouring cream for desserts and curries.',
        imageUrl: null,
      },
      {
        slug: 'paneer',
        name: 'Paneer',
        unit: '250 g',
        price: 420,
        description: 'Fresh soft cottage cheese.',
        imageUrl: '/static/products/paneer.jpg',
      },
      {
        slug: 'lassi',
        name: 'Sweet Lassi',
        unit: '250 ml',
        price: 120,
        description: 'Chilled sweet yogurt drink.',
        imageUrl: '/static/products/lassi.jpg',
      },
      {
        slug: 'desi-ghee',
        name: 'Desi Ghee',
        unit: '500 g',
        price: 1600,
        description: 'Pure clarified butter.',
        imageUrl: '/static/products/desi-ghee.jpg',
      },
    ],
  },
  {
    slug: 'groceries',
    name: 'Groceries',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Cappy_Brothers_and_Sons_market_-_DPLA_-_913023d0656e5d7ce8dd3bcceed1626e.jpg/960px-Cappy_Brothers_and_Sons_market_-_DPLA_-_913023d0656e5d7ce8dd3bcceed1626e.jpg',
    products: [
      {
        slug: 'basmati-rice',
        name: 'Basmati Rice',
        unit: '5 kg',
        price: 2400,
        description: 'Long-grain aged basmati.',
        imageUrl: '/static/products/basmati-rice.jpg',
      },
      {
        slug: 'wheat-flour',
        name: 'Wheat Flour (Atta)',
        unit: '10 kg',
        price: 1350,
        description: 'Stone-ground chakki atta.',
        imageUrl: '/static/products/wheat-flour.jpg',
      },
      {
        slug: 'cooking-oil',
        name: 'Cooking Oil',
        unit: '5 L',
        price: 3200,
        description: 'Refined blended cooking oil.',
        imageUrl: '/static/products/cooking-oil.jpg',
      },
      {
        slug: 'sugar',
        name: 'Sugar',
        unit: '1 kg',
        price: 180,
        description: 'Refined white sugar.',
        imageUrl: '/static/products/sugar.jpg',
      },
      {
        slug: 'salt',
        name: 'Iodised Salt',
        unit: '800 g',
        price: 60,
        description: 'Free-flowing iodised salt.',
        imageUrl: '/static/products/salt.jpg',
      },
      {
        slug: 'green-tea',
        name: 'Green Tea (Qehwa)',
        unit: '200 g',
        price: 480,
        description: 'Loose-leaf green tea for qehwa.',
        imageUrl: '/static/products/green-tea.jpg',
      },
      {
        slug: 'black-tea',
        name: 'Black Tea',
        unit: '950 g',
        price: 1450,
        description: 'Strong blended black tea for chai.',
        imageUrl: '/static/products/black-tea.jpg',
      },
      {
        slug: 'instant-coffee',
        name: 'Instant Coffee',
        unit: '100 g',
        price: 900,
        description: 'Freeze-dried instant coffee.',
        imageUrl: '/static/products/instant-coffee.jpg',
      },
      {
        slug: 'ketchup',
        name: 'Tomato Ketchup',
        unit: '800 g',
        price: 420,
        description: 'Thick tomato ketchup.',
        imageUrl: '/static/products/ketchup.jpg',
      },
      {
        slug: 'spaghetti',
        name: 'Spaghetti',
        unit: '400 g',
        price: 260,
        description: 'Durum wheat spaghetti.',
        imageUrl: null,
      },
      {
        slug: 'vermicelli',
        name: 'Vermicelli (Seviyan)',
        unit: '150 g',
        price: 90,
        description: 'Fine roasted vermicelli for sheer khurma.',
        imageUrl: '/static/products/vermicelli.jpg',
      },
      {
        slug: 'honey',
        name: 'Honey',
        unit: '500 g',
        price: 900,
        description: 'Pure natural honey.',
        imageUrl: '/static/products/honey.jpg',
      },
      {
        slug: 'red-chilli-powder',
        name: 'Red Chilli Powder',
        unit: '200 g',
        price: 220,
        description: 'Ground red chilli.',
        imageUrl: '/static/products/red-chilli-powder.jpg',
      },
      {
        slug: 'turmeric-powder',
        name: 'Turmeric Powder (Haldi)',
        unit: '200 g',
        price: 190,
        description: 'Ground turmeric.',
        imageUrl: '/static/products/turmeric-powder.jpg',
      },
      {
        slug: 'cumin-seeds',
        name: 'Cumin Seeds (Zeera)',
        unit: '100 g',
        price: 260,
        description: 'Whole cumin seeds.',
        imageUrl: '/static/products/cumin-seeds.jpg',
      },
      {
        slug: 'black-pepper',
        name: 'Black Pepper',
        unit: '100 g',
        price: 400,
        description: 'Whole black peppercorns.',
        imageUrl: '/static/products/black-pepper.jpg',
      },
      {
        slug: 'brown-bread',
        name: 'Brown Bread',
        unit: '400 g',
        price: 180,
        description: 'Soft wholemeal sandwich loaf.',
        imageUrl: '/static/products/brown-bread.jpg',
      },
      {
        slug: 'corn-flakes',
        name: 'Corn Flakes',
        unit: '500 g',
        price: 750,
        description: 'Crispy breakfast corn flakes.',
        imageUrl: '/static/products/corn-flakes.jpg',
      },
      {
        slug: 'biscuits',
        name: 'Tea Biscuits',
        unit: '400 g',
        price: 320,
        description: 'Crunchy biscuits for chai.',
        imageUrl: '/static/products/biscuits.jpg',
      },
    ],
  },
  {
    slug: 'lentils',
    name: 'Lentils & Pulses',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Assorted_pulses_for_display_at_Ahare_Bangla_2016.jpg/960px-Assorted_pulses_for_display_at_Ahare_Bangla_2016.jpg',
    products: [
      {
        slug: 'daal-chana',
        name: 'Daal Chana',
        unit: '1 kg',
        price: 340,
        description: 'Split bengal gram.',
        imageUrl: '/static/products/daal-chana.jpg',
      },
      {
        slug: 'daal-masoor',
        name: 'Daal Masoor',
        unit: '1 kg',
        price: 380,
        description: 'Red split lentils, quick cooking.',
        imageUrl: '/static/products/daal-masoor.jpg',
      },
      {
        slug: 'daal-moong',
        name: 'Daal Moong',
        unit: '1 kg',
        price: 420,
        description: 'Split yellow mung beans.',
        imageUrl: '/static/products/daal-moong.jpg',
      },
      {
        slug: 'daal-mash',
        name: 'Daal Mash',
        unit: '1 kg',
        price: 520,
        description: 'Split white urad.',
        imageUrl: '/static/products/daal-mash.jpg',
      },
      {
        slug: 'daal-arhar',
        name: 'Daal Arhar (Toor)',
        unit: '1 kg',
        price: 480,
        description: 'Split pigeon peas.',
        imageUrl: '/static/products/daal-arhar.jpg',
      },
      {
        slug: 'kabuli-chana',
        name: 'Kabuli Chana (Chickpeas)',
        unit: '1 kg',
        price: 400,
        description: 'Whole white chickpeas.',
        imageUrl: '/static/products/kabuli-chana.jpg',
      },
      {
        slug: 'kala-chana',
        name: 'Kala Chana',
        unit: '1 kg',
        price: 320,
        description: 'Whole brown chickpeas.',
        imageUrl: '/static/products/kala-chana.jpg',
      },
      {
        slug: 'rajma',
        name: 'Red Kidney Beans (Rajma)',
        unit: '1 kg',
        price: 460,
        description: 'Dried red kidney beans.',
        imageUrl: '/static/products/rajma.jpg',
      },
      {
        slug: 'white-lobia',
        name: 'White Lobia (Black-eyed Peas)',
        unit: '1 kg',
        price: 380,
        description: 'Dried black-eyed peas.',
        imageUrl: '/static/products/white-lobia.jpg',
      },
      {
        slug: 'green-moong-whole',
        name: 'Green Moong (Whole)',
        unit: '1 kg',
        price: 400,
        description: 'Whole green mung beans.',
        imageUrl: '/static/products/green-moong-whole.jpg',
      },
    ],
  },
  {
    slug: 'toiletries',
    name: 'Toiletries',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cow-brand-additive-free-shampoo.jpg/960px-Cow-brand-additive-free-shampoo.jpg',
    products: [
      {
        slug: 'bath-soap',
        name: 'Bath Soap',
        unit: '3 x 100 g',
        price: 330,
        description: 'Moisturising bath soap, triple pack.',
        imageUrl: '/static/products/bath-soap.jpg',
      },
      {
        slug: 'shampoo',
        name: 'Shampoo',
        unit: '400 ml',
        price: 850,
        description: 'Everyday cleansing shampoo.',
        imageUrl: '/static/products/shampoo.jpg',
      },
      {
        slug: 'toothpaste',
        name: 'Toothpaste',
        unit: '150 g',
        price: 380,
        description: 'Fluoride cavity-protection toothpaste.',
        imageUrl: '/static/products/toothpaste.jpg',
      },
      {
        slug: 'toothbrush',
        name: 'Toothbrush',
        unit: '2 pcs',
        price: 220,
        description: 'Soft-bristle toothbrushes, twin pack.',
        imageUrl: '/static/products/toothbrush.jpg',
      },
      {
        slug: 'hand-wash',
        name: 'Hand Wash',
        unit: '500 ml',
        price: 420,
        description: 'Antibacterial liquid hand wash.',
        imageUrl: null,
      },
      {
        slug: 'body-lotion',
        name: 'Body Lotion',
        unit: '400 ml',
        price: 780,
        description: 'Daily moisturising lotion.',
        imageUrl: '/static/products/body-lotion.jpg',
      },
      {
        slug: 'shaving-foam',
        name: 'Shaving Foam',
        unit: '200 ml',
        price: 650,
        description: 'Rich lather shaving foam.',
        imageUrl: '/static/products/shaving-foam.jpg',
      },
      {
        slug: 'toilet-paper',
        name: 'Toilet Paper',
        unit: '4 rolls',
        price: 480,
        description: 'Soft 2-ply toilet rolls.',
        imageUrl: '/static/products/toilet-paper.jpg',
      },
      {
        slug: 'facial-tissues',
        name: 'Facial Tissues',
        unit: '150 sheets',
        price: 260,
        description: 'Soft facial tissues.',
        imageUrl: '/static/products/facial-tissues.jpg',
      },
      {
        slug: 'detergent-powder',
        name: 'Detergent Powder',
        unit: '1 kg',
        price: 620,
        description: 'High-foam washing powder.',
        imageUrl: '/static/products/detergent-powder.jpg',
      },
      {
        slug: 'dishwashing-liquid',
        name: 'Dishwashing Liquid',
        unit: '500 ml',
        price: 340,
        description: 'Cuts grease fast.',
        imageUrl: '/static/products/dishwashing-liquid.jpg',
      },
      {
        slug: 'deodorant',
        name: 'Deodorant Spray',
        unit: '150 ml',
        price: 690,
        description: '48-hour odour protection.',
        imageUrl: '/static/products/deodorant.jpg',
      },
      {
        slug: 'hand-sanitizer',
        name: 'Hand Sanitizer',
        unit: '250 ml',
        price: 300,
        description: '70% alcohol sanitising gel.',
        imageUrl: '/static/products/hand-sanitizer.jpg',
      },
      {
        slug: 'shower-gel',
        name: 'Shower Gel',
        unit: '250 ml',
        price: 560,
        description: 'Refreshing shower gel.',
        imageUrl: '/static/products/shower-gel.jpg',
      },
    ],
  },
  {
    slug: 'sports',
    name: 'Sports',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/New_Berlin_June_2025_07_%28Burghardt_Sporting_Goods%29.jpg/960px-New_Berlin_June_2025_07_%28Burghardt_Sporting_Goods%29.jpg',
    products: [
      {
        slug: 'cricket-ball-leather',
        name: 'Cricket Ball (Leather)',
        unit: '1 pc',
        price: 1800,
        description: 'Match-grade red leather cricket ball.',
        imageUrl: '/static/products/cricket-ball-leather.jpg',
      },
      {
        slug: 'cricket-tennis-ball',
        name: 'Cricket Tennis Ball',
        unit: '1 pc',
        price: 250,
        description: 'Soft tennis ball for street cricket.',
        imageUrl: null,
      },
      {
        slug: 'cricket-tape-ball',
        name: 'Tape Ball',
        unit: '1 pc',
        price: 180,
        description: 'Pre-taped tennis ball, ready to bowl.',
        imageUrl: null,
      },
      {
        slug: 'cricket-ball-tape',
        name: 'Cricket Ball Tape',
        unit: '1 roll',
        price: 120,
        description: 'Electrical tape for taping tennis balls.',
        imageUrl: '/static/products/cricket-ball-tape.jpg',
      },
      {
        slug: 'shuttlecock-feather',
        name: 'Badminton Shuttlecock (Feather)',
        unit: 'tube of 6',
        price: 1400,
        description: 'Goose-feather shuttles for match play.',
        imageUrl: '/static/products/shuttlecock-feather.jpg',
      },
      {
        slug: 'shuttlecock-nylon',
        name: 'Badminton Shuttlecock (Nylon)',
        unit: '3 pcs',
        price: 600,
        description: 'Durable nylon shuttles for practice.',
        imageUrl: '/static/products/shuttlecock-nylon.jpg',
      },
      {
        slug: 'badminton-racket',
        name: 'Badminton Racket',
        unit: '1 pc',
        price: 2200,
        description: 'Lightweight aluminium racket.',
        imageUrl: '/static/products/badminton-racket.jpg',
      },
      {
        slug: 'cricket-bat',
        name: 'Cricket Bat (Tape Ball)',
        unit: '1 pc',
        price: 3500,
        description: 'Lightweight bat tuned for tape-ball cricket.',
        imageUrl: '/static/products/cricket-bat.jpg',
      },
      {
        slug: 'cricket-stumps',
        name: 'Cricket Stumps Set',
        unit: 'set of 6',
        price: 1800,
        description: 'Full wicket set with bails.',
        imageUrl: null,
      },
      {
        slug: 'football',
        name: 'Football',
        unit: 'size 5',
        price: 1600,
        description: 'Hand-stitched match football.',
        imageUrl: '/static/products/football.jpg',
      },
      {
        slug: 'table-tennis-balls',
        name: 'Table Tennis Balls',
        unit: '6 pcs',
        price: 400,
        description: '40mm competition ping-pong balls.',
        imageUrl: null,
      },
      {
        slug: 'skipping-rope',
        name: 'Skipping Rope',
        unit: '1 pc',
        price: 450,
        description: 'Adjustable speed rope.',
        imageUrl: null,
      },
    ],
  },
];

/** 82 products across 6 categories. */
export const SEED_PRODUCT_COUNT = 82;

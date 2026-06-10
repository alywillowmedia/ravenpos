export interface RavenliaImage {
    src: string;
    alt: string;
}

export interface RavenliaExternalLinks {
    updates: string;
    events: string;
    vendorApplication: string;
    vendorPhotosEmail: string;
    maps: string;
    alywillow: string;
    phone: string;
    email: string;
}

export const ravenliaLinks: RavenliaExternalLinks = {
    updates: 'https://ravenlia.kit.com/6ccb4167d5',
    events: 'https://ravenlia.eventcube.io/',
    vendorApplication: 'https://docs.google.com/forms/d/e/1FAIpQLSfi2Q2n8XU-e_Eeur-xFEEgHUZIUwK-B0Zc6wB3VsU7di4Jrw/viewform',
    vendorPhotosEmail: 'mailto:ravenliagalleria@gmail.com',
    maps: 'https://maps.app.goo.gl/EpX721PJARthypsNA',
    alywillow: 'https://alywillow.com/',
    phone: 'tel:+12766013010',
    email: 'mailto:ravenliagalleria@gmail.com',
};

export const ravenliaContact = {
    name: 'Ravenlia Galleria',
    tagline: "Collectibles, Appalachian art, handmade goods, Alywillow Organics, and tea bar cafe.",
    addressLines: ['682 Skyline Hwy', 'Galax, VA 24333'],
    phoneDisplay: '+1 (276) 601-3010',
    emailDisplay: 'ravenliagalleria@gmail.com',
    hours: [
        { day: 'Monday', hours: 'Closed' },
        { day: 'Tuesday', hours: 'Closed' },
        { day: 'Wednesday', hours: '10 AM - 7 PM' },
        { day: 'Thursday', hours: '10 AM - 7 PM' },
        { day: 'Friday', hours: '10 AM - 7 PM' },
        { day: 'Saturday', hours: '10 AM - 7 PM' },
        { day: 'Sunday', hours: '1 PM - 5 PM' },
    ],
};

export const ravenliaImages = {
    frontDoor: {
        src: '/ravenlia/front-door.jpg',
        alt: 'The red front door and Ravenlia Galleria signs at the storefront.',
    },
    directions: {
        src: '/ravenlia/directions.jpg',
        alt: 'Map directions to Ravenlia Galleria between Galax and the Blue Ridge Parkway.',
    },
    wordmark: {
        src: '/ravenlia/wordmark.png',
        alt: 'Ravenlia Galleria wordmark.',
    },
    fullLogo: {
        src: '/ravenlia/full-logo.png',
        alt: 'Ravenlia Galleria logo.',
    },
    sourdough: {
        src: '/ravenlia/sourdough.jpg',
        alt: 'Fresh sourdough bread from the Ravenlia market.',
    },
    eggs: {
        src: '/ravenlia/eggs.jpg',
        alt: 'Fresh local eggs available at Ravenlia.',
    },
    turtleArt: {
        src: '/ravenlia/turtle-art.jpg',
        alt: 'A Ravenlia turtle art piece.',
    },
    vintageGoods: {
        src: '/ravenlia/vintage-goods.jpg',
        alt: 'Vintage and primitive goods from Ravenlia.',
    },
    handmadeGallery: {
        src: '/ravenlia/handmade-gallery.jpg',
        alt: 'Handmade goods displayed in the Ravenlia gallery.',
    },
    aliya: {
        src: '/ravenlia/aliya.jpg',
        alt: 'Aliya Trinity of Alywillow and Ravenlia.',
    },
} satisfies Record<string, RavenliaImage>;

export const shoppingHighlights = [
    {
        title: 'Alywillow Organics',
        text: 'Ravenlia is home to Alywillow, where plant-based products are made on site in small batches without synthetic ingredients.',
        image: ravenliaImages.handmadeGallery,
        href: ravenliaLinks.alywillow,
    },
    {
        title: 'Vintage and Primitive',
        text: 'Browse antique, primitive, and vintage pieces chosen for character, warmth, and the kind of story you only find once.',
        image: ravenliaImages.vintageGoods,
    },
    {
        title: 'Local Arts and Crafts',
        text: 'Each booth carries its own voice, from woodworking and carving to pottery, paintings, textiles, quilts, and handmade decor.',
        image: ravenliaImages.turtleArt,
    },
    {
        title: 'Fresh Market Goods',
        text: 'Fresh eggs, local honey, breads, produce, plants, and seasonal market finds bring daily life into the gallery.',
        image: ravenliaImages.eggs,
    },
];

export const vendorCrafts = [
    'Woodworking, carving, painting, drawing, and felting',
    'Soy candles, pottery, sculpture, glass, and brooms',
    'Quilts, clothing, aprons, hats, and textile goods',
    'Breads, cakes, honey, jerky, coffee, plants, and produce',
    'Natural products, primitives, and Appalachian-themed goods',
];

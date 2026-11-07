// Creates 12 fake invoices and their ground truth from one fixed seed. All names and numbers are synthetic.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { PDFParse } from 'pdf-parse';
import sharp from 'sharp';
import { InvoiceSchema } from '@opp/shared';
import type { InvoiceData, Language, LineItem, Quality } from './score';

const SEED = 20261107;
const DATA_DIR = join(__dirname, 'data');
const INVOICE_DIR = join(DATA_DIR, 'invoices');

// ── Seeded randomness (mulberry32): same seed, same invoices ──────────────────

function createRandom(seed: number) {
    let state = seed;
    const next = () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
        next,
        int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
        pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)],
        digits: (count: number) => Array.from({ length: count }, () => Math.floor(next() * 10)).join(''),
    };
}
type Random = ReturnType<typeof createRandom>;

// ── The 12 invoices: every requested variation is listed here on purpose ──────

type DateStyle = 'dotted' | 'iso' | 'long';
type NumberStyle = 'german' | 'english';

interface InvoiceSpec {
    id: string;
    language: Language;
    quality: Quality;
    dateStyle: DateStyle;
    numberStyle: NumberStyle;
    vatRate: 7 | 19;
    itemCount: number;
    invoiceNumber: string;
    currency: 'EUR' | 'GBP' | 'USD';
    discount?: boolean;
    negativeLine?: boolean;
    noDueDate?: boolean;
}

const SPECS: InvoiceSpec[] = [
    { id: 'inv-01', language: 'german', quality: 'clean', dateStyle: 'dotted', numberStyle: 'german', vatRate: 19, itemCount: 3, invoiceNumber: 'RE-2026-0412', currency: 'EUR' },
    { id: 'inv-02', language: 'german', quality: 'clean', dateStyle: 'iso', numberStyle: 'german', vatRate: 7, itemCount: 1, invoiceNumber: 'RE20260047', currency: 'EUR' },
    { id: 'inv-03', language: 'german', quality: 'clean', dateStyle: 'long', numberStyle: 'german', vatRate: 19, itemCount: 8, invoiceNumber: '2026/0093', currency: 'EUR', discount: true },
    { id: 'inv-04', language: 'english', quality: 'clean', dateStyle: 'long', numberStyle: 'english', vatRate: 19, itemCount: 5, invoiceNumber: 'INV-10482', currency: 'USD' },
    { id: 'inv-05', language: 'english', quality: 'clean', dateStyle: 'iso', numberStyle: 'english', vatRate: 7, itemCount: 2, invoiceNumber: 'INV20261188', currency: 'GBP', noDueDate: true },
    { id: 'inv-06', language: 'english', quality: 'clean', dateStyle: 'dotted', numberStyle: 'german', vatRate: 19, itemCount: 4, invoiceNumber: 'CN-3307', currency: 'EUR', negativeLine: true },
    { id: 'inv-07', language: 'german', quality: 'scanned', dateStyle: 'dotted', numberStyle: 'german', vatRate: 19, itemCount: 6, invoiceNumber: 'RE-2026-0588', currency: 'EUR' },
    { id: 'inv-08', language: 'german', quality: 'scanned', dateStyle: 'iso', numberStyle: 'english', vatRate: 7, itemCount: 2, invoiceNumber: 'R-77120', currency: 'EUR', noDueDate: true },
    { id: 'inv-09', language: 'english', quality: 'scanned', dateStyle: 'long', numberStyle: 'english', vatRate: 19, itemCount: 3, invoiceNumber: 'INV-10533', currency: 'USD' },
    { id: 'inv-10', language: 'german', quality: 'photo', dateStyle: 'dotted', numberStyle: 'german', vatRate: 7, itemCount: 4, invoiceNumber: 'RE-2026-0701', currency: 'EUR' },
    { id: 'inv-11', language: 'english', quality: 'photo', dateStyle: 'long', numberStyle: 'english', vatRate: 19, itemCount: 1, invoiceNumber: 'INV-10610', currency: 'GBP' },
    { id: 'inv-12', language: 'english', quality: 'photo', dateStyle: 'iso', numberStyle: 'english', vatRate: 7, itemCount: 5, invoiceNumber: 'INV-10644', currency: 'USD' },
];

const COMPANIES = {
    german: ['Nordlicht Bürotechnik GmbH', 'Weserblick Handels AG', 'Teutoburger Druckhaus KG', 'Lindenhof Software GmbH', 'Sennestadt Logistik GmbH', 'Falkenried Elektro OHG'],
    english: ['Bluefern Supplies Ltd', 'Harbourline Systems Inc', 'Oakmere Print Works LLC', 'Greyfriars Consulting Ltd', 'Copperfield Tools Inc', 'Thistledown Media Ltd'],
};
const STREETS = {
    german: ['Lindenstraße', 'Am Sparrenberg', 'Münzweg', 'Herforder Allee', 'Schillerplatz'],
    english: ['Maple Avenue', 'King Street', 'Harbour Road', 'Elm Close', 'Station Lane'],
};
const CITIES = {
    german: ['33602 Testhausen', '10115 Musterstadt', '50667 Beispielburg', '80331 Probedorf'],
    english: ['Sampleton AB1 2CD', 'Exampleville EX4 5MP', 'Fakeham FK9 1ZZ', 'Mockford MK2 7QT'],
};
const PRODUCTS = {
    german: ['Bürostuhl Ergo Plus', 'Druckerpapier A4 (500 Blatt)', 'Wartungsvertrag Kopierer', 'Lizenz Buchhaltungssoftware', 'Monitorhalterung schwenkbar', 'Montage vor Ort', 'Tonerkartusche schwarz', 'Schulung Datenschutz', 'Aktenvernichter P-4', 'Versandkosten Spedition'],
    english: ['Ergonomic office chair', 'Copy paper A4 (500 sheets)', 'Copier maintenance plan', 'Accounting software licence', 'Adjustable monitor arm', 'On-site installation', 'Black toner cartridge', 'Data protection training', 'Cross-cut paper shredder', 'Freight delivery charge'],
};

const LABELS = {
    german: { title: 'Rechnung', number: 'Rechnungsnummer', issued: 'Rechnungsdatum', due: 'Fällig am', to: 'Rechnungsempfänger', item: 'Beschreibung', qty: 'Menge', unit: 'Einzelpreis', total: 'Gesamt', subtotal: 'Zwischensumme (netto)', tax: 'MwSt.', grand: 'Gesamtbetrag', currency: 'Alle Beträge in', vatId: 'USt-IdNr.', discount: 'Rabatt', credit: 'Gutschrift Rücksendung', phone: 'Tel.' },
    english: { title: 'Invoice', number: 'Invoice number', issued: 'Invoice date', due: 'Due date', to: 'Bill to', item: 'Description', qty: 'Qty', unit: 'Unit price', total: 'Total', subtotal: 'Subtotal', tax: 'VAT', grand: 'Amount due', currency: 'All amounts in', vatId: 'VAT ID', discount: 'Discount', credit: 'Returned goods credit', phone: 'Phone' },
};

const MONTHS = {
    german: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
    english: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

// ── Formatting: how values are printed, while the truth stays ISO and numeric ─

export function formatDate(iso: string, style: DateStyle, language: Language): string {
    const [year, month, day] = iso.split('-');
    if (style === 'iso') return iso;
    if (style === 'dotted') return `${day}.${month}.${year}`;
    const dayNumber = Number(day);
    const monthName = MONTHS[language][Number(month) - 1];
    return language === 'german' ? `${dayNumber}. ${monthName} ${year}` : `${dayNumber} ${monthName} ${year}`;
}

export function formatAmount(amount: number, style: NumberStyle): string {
    const [whole, decimals] = Math.abs(amount).toFixed(2).split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, style === 'german' ? '.' : ',');
    return `${amount < 0 ? '-' : ''}${grouped}${style === 'german' ? ',' : '.'}${decimals}`;
}

/** A real IBAN checksum (ISO 13616, mod 97) over random digits: valid in form, tied to no real account. */
export function fakeGermanIban(random: Random): string {
    const account = random.digits(18);
    const numeric = `${account}131400`; // "DE" as digits (D=13, E=14), then "00" as the checksum placeholder.
    const remainder = Number(BigInt(numeric) % 97n);
    return `DE${String(98 - remainder).padStart(2, '0')}${account}`;
}

// ── Building one invoice's data ───────────────────────────────────────────────

const cents = (value: number) => Math.round(value * 100) / 100;

function addDays(iso: string, days: number): string {
    return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function buildAddress(random: Random, language: Language): string {
    return `${random.pick(STREETS[language])} ${random.int(1, 98)}, ${random.pick(CITIES[language])}`;
}

function buildInvoice(spec: InvoiceSpec, random: Random) {
    const language = spec.language;
    const companies = [...COMPANIES[language]].sort(() => random.next() - 0.5);
    const products = [...PRODUCTS[language]].sort(() => random.next() - 0.5);
    const lineItems: LineItem[] = [];

    // The two special lines are part of itemCount, so every invoice stays within 1-8 lines.
    const regularCount = spec.itemCount - (spec.discount ? 1 : 0) - (spec.negativeLine ? 1 : 0);
    for (let i = 0; i < regularCount; i++) {
        const quantity = random.int(1, 12);
        const unitPrice = cents(random.int(450, 129_900) / 100);
        lineItems.push({ description: products[i], quantity, unitPrice, totalPrice: cents(quantity * unitPrice) });
    }
    const positiveSum = cents(lineItems.reduce((sum, line) => sum + line.totalPrice, 0));
    if (spec.discount) {
        const amount = -cents(positiveSum * 0.05);
        lineItems.push({ description: `${LABELS[language].discount} 5 %`, quantity: 1, unitPrice: amount, totalPrice: amount });
    }
    if (spec.negativeLine) {
        const amount = -cents(lineItems[0].unitPrice);
        lineItems.push({ description: LABELS[language].credit, quantity: 1, unitPrice: amount, totalPrice: amount });
    }

    const subtotal = cents(lineItems.reduce((sum, line) => sum + line.totalPrice, 0));
    const taxAmount = cents((subtotal * spec.vatRate) / 100);
    const issueDate = addDays('2026-09-01', random.int(0, 60));

    const invoice: InvoiceData = {
        invoiceNumber: spec.invoiceNumber,
        issueDate,
        dueDate: spec.noDueDate ? null : addDays(issueDate, random.pick([14, 30])),
        vendorName: companies[0],
        vendorAddress: buildAddress(random, language),
        customerName: companies[1],
        customerAddress: buildAddress(random, language),
        lineItems,
        subtotal,
        taxAmount,
        totalAmount: cents(subtotal + taxAmount),
        currency: spec.currency,
    };
    // Printed on the page but not scored: InvoiceSchema has no fields for these.
    const printedOnly = {
        iban: fakeGermanIban(random),
        vatId: `DE${random.digits(9)}`,
        email: `billing@${companies[0].split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}.example.com`,
        phone: `+49 555 ${random.digits(6)}`,
        vatRate: spec.vatRate,
    };
    return { invoice: InvoiceSchema.parse(invoice) as InvoiceData, printedOnly };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

type BuiltInvoice = ReturnType<typeof buildInvoice>;

function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.end();
    });
}

// A fixed creation date keeps the PDF bytes the same on every run.
const newPdf = () => new PDFDocument({ size: 'A4', margin: 50, info: { CreationDate: new Date('2026-11-07T00:00:00Z') } });

function renderCleanPdf(spec: InvoiceSpec, { invoice, printedOnly }: BuiltInvoice): Promise<Buffer> {
    const labels = LABELS[spec.language];
    const date = (iso: string) => formatDate(iso, spec.dateStyle, spec.language);
    const money = (amount: number) => formatAmount(amount, spec.numberStyle);
    const doc = newPdf();

    doc.font('Helvetica-Bold').fontSize(16).text(invoice.vendorName!, 50, 50);
    doc.font('Helvetica').fontSize(10).text(invoice.vendorAddress!);
    doc.font('Helvetica-Bold').fontSize(20).text(labels.title, 50, 110);

    doc.font('Helvetica').fontSize(10);
    doc.text(`${labels.number}: ${invoice.invoiceNumber}`, 330, 110);
    doc.text(`${labels.issued}: ${date(invoice.issueDate!)}`, 330);
    if (invoice.dueDate) doc.text(`${labels.due}: ${date(invoice.dueDate)}`, 330);
    doc.text(`${labels.currency} ${invoice.currency}`, 330);

    doc.font('Helvetica-Bold').text(labels.to, 50, 165);
    doc.font('Helvetica').text(invoice.customerName!, 50);
    doc.text(invoice.customerAddress!, 50);

    const row = (y: number, cells: string[]) => {
        doc.text(cells[0], 50, y, { width: 260 });
        doc.text(cells[1], 315, y, { width: 40, align: 'right' });
        doc.text(cells[2], 365, y, { width: 80, align: 'right' });
        doc.text(cells[3], 455, y, { width: 90, align: 'right' });
    };

    let y = 235;
    doc.font('Helvetica-Bold');
    row(y, [labels.item, labels.qty, labels.unit, labels.total]);
    doc.moveTo(50, y + 14).lineTo(545, y + 14).stroke();
    doc.font('Helvetica');
    y += 22;
    for (const line of invoice.lineItems) {
        row(y, [line.description, String(line.quantity), money(line.unitPrice), money(line.totalPrice)]);
        y += 20;
    }
    doc.moveTo(315, y).lineTo(545, y).stroke();
    y += 8;

    const totalRow = (label: string, amount: number) => {
        doc.text(label, 315, y, { width: 130 });
        doc.text(money(amount), 455, y, { width: 90, align: 'right' });
        y += 16;
    };
    totalRow(labels.subtotal, invoice.subtotal!);
    totalRow(`${labels.tax} ${printedOnly.vatRate} %`, invoice.taxAmount!);
    doc.font('Helvetica-Bold');
    totalRow(labels.grand, invoice.totalAmount!);

    doc.font('Helvetica').fontSize(8).text(
        `IBAN ${printedOnly.iban.replace(/(.{4})/g, '$1 ').trim()}  |  ${labels.vatId} ${printedOnly.vatId}  |  ${printedOnly.email}  |  ${labels.phone} ${printedOnly.phone}`,
        50,
        760,
        { width: 495, align: 'center' },
    );
    return pdfToBuffer(doc);
}

/** Random grey specks, from our seed rather than sharp's own noise, so the output is reproducible. */
async function noiseLayer(width: number, height: number, random: Random, strength: number): Promise<Buffer> {
    const pixels = Buffer.alloc(width * height * 2);
    for (let i = 0; i < pixels.length; i += 2) {
        pixels[i] = random.next() < 0.5 ? 0 : 255;
        pixels[i + 1] = Math.floor(random.next() * strength);
    }
    return sharp(pixels, { raw: { width, height, channels: 2 } }).png().toBuffer();
}

async function rasterize(pdf: Buffer): Promise<Buffer> {
    const parser = new PDFParse({ data: pdf });
    try {
        const result = await parser.getScreenshot({ first: 1, scale: 2 });
        return Buffer.from(result.pages[0].data);
    } finally {
        await parser.destroy();
    }
}

/** Scan look: slight rotation, soft focus and speckle, saved as an image-only PDF with no text layer. */
async function renderScan(cleanPdf: Buffer, random: Random): Promise<Buffer> {
    const angle = (random.next() < 0.5 ? -1 : 1) * (0.6 + random.next());
    const rotated = await sharp(await rasterize(cleanPdf))
        .flatten({ background: '#ffffff' })
        .rotate(angle, { background: '#ffffff' })
        .blur(0.7)
        .png()
        .toBuffer();
    const { width, height } = await sharp(rotated).metadata();
    const scan = await sharp(rotated)
        .composite([{ input: await noiseLayer(width!, height!, random, 45) }])
        .greyscale()
        .jpeg({ quality: 80 })
        .toBuffer();

    const doc = newPdf();
    doc.image(scan, 0, 0, { width: doc.page.width, height: doc.page.height });
    return pdfToBuffer(doc);
}

/** Photo look: paper on a desk at an angle, warm light, a shadow across the page and JPEG compression. */
async function renderPhoto(cleanPdf: Buffer, random: Random): Promise<Buffer> {
    const angle = (random.next() < 0.5 ? -1 : 1) * (2 + random.next() * 2);
    const rotated = await sharp(await rasterize(cleanPdf))
        .flatten({ background: '#ffffff' })
        .resize({ width: 1000 })
        .rotate(angle, { background: '#6b5a48' })
        .extend({ top: 50, bottom: 50, left: 50, right: 50, background: '#6b5a48' })
        .png()
        .toBuffer();
    const { width, height } = await sharp(rotated).metadata();
    const shadow = Buffer.from(
        `<svg width="${width}" height="${height}"><defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1">` +
            `<stop offset="0" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity="0.35"/>` +
            `</linearGradient></defs><rect width="100%" height="100%" fill="url(#s)"/></svg>`,
    );
    return sharp(rotated)
        .composite([{ input: shadow }, { input: await noiseLayer(width!, height!, random, 20) }])
        .tint({ r: 255, g: 240, b: 215 })
        .blur(0.5)
        .jpeg({ quality: 68 })
        .toBuffer();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    rmSync(INVOICE_DIR, { recursive: true, force: true });
    mkdirSync(INVOICE_DIR, { recursive: true });
    const random = createRandom(SEED);
    const groundTruth: unknown[] = [];

    for (const spec of SPECS) {
        const built = buildInvoice(spec, random);
        const cleanPdf = await renderCleanPdf(spec, built);
        const file = `${spec.id}-${spec.language}-${spec.quality}.${spec.quality === 'photo' ? 'jpg' : 'pdf'}`;
        const bytes =
            spec.quality === 'clean' ? cleanPdf : spec.quality === 'scanned' ? await renderScan(cleanPdf, random) : await renderPhoto(cleanPdf, random);

        writeFileSync(join(INVOICE_DIR, file), bytes);
        groundTruth.push({
            id: spec.id,
            file,
            mimeType: spec.quality === 'photo' ? 'image/jpeg' : 'application/pdf',
            language: spec.language,
            quality: spec.quality,
            variation: { dateStyle: spec.dateStyle, numberStyle: spec.numberStyle, discount: !!spec.discount, negativeLine: !!spec.negativeLine },
            invoice: built.invoice,
            printedOnly: built.printedOnly,
        });
        console.log(`wrote ${file} (${Math.round(bytes.length / 1024)} KB)`);
    }

    writeFileSync(join(DATA_DIR, 'ground_truth.json'), `${JSON.stringify(groundTruth, null, 2)}\n`);
    console.log(`wrote ground_truth.json with ${groundTruth.length} invoices`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

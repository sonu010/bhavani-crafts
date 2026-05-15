import { Product, PRODUCTS as INITIAL_PRODUCTS } from "./products";
import fs from "fs";
import path from "path";

const DB_FILE = path.join(process.cwd(), "src/lib/db.json");

function ensureDb() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_PRODUCTS, null, 2));
  }
}

export async function getProducts(): Promise<Product[]> {
  ensureDb();
  const data = fs.readFileSync(DB_FILE, "utf-8");
  return JSON.parse(data);
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const products = await getProducts();
  return products.find((p) => p.id === id);
}

export async function addProduct(product: Omit<Product, "id">): Promise<Product> {
  const products = await getProducts();
  const newProduct: Product = {
    ...product,
    id: crypto.randomUUID(),
  };
  const updated = [newProduct, ...products];
  fs.writeFileSync(DB_FILE, JSON.stringify(updated, null, 2));
  return newProduct;
}

export async function deleteProduct(id: string): Promise<void> {
  const products = await getProducts();
  const updated = products.filter((p) => p.id !== id);
  fs.writeFileSync(DB_FILE, JSON.stringify(updated, null, 2));
}

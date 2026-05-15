"use server";

import { addProduct, deleteProduct } from "./db";
import { revalidatePath } from "next/cache";
import { Category } from "./products";

export async function createProductAction(formData: FormData) {
  const name = formData.get("name") as string;
  const category = formData.get("category") as Category;
  const price = Number(formData.get("price"));
  const description = formData.get("description") as string;
  const image = formData.get("image") as string;
  const inStock = formData.get("inStock") === "true";

  await addProduct({
    name,
    category,
    price,
    description,
    image: image || "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&q=80",
    rating: 5,
    reviews: 0,
    inStock,
    tags: [category],
  });

  revalidatePath("/admin");
  revalidatePath("/products");
  revalidatePath("/gallery");
  revalidatePath("/");
}

export async function removeProductAction(id: string) {
  await deleteProduct(id);
  revalidatePath("/admin");
  revalidatePath("/products");
  revalidatePath("/gallery");
  revalidatePath("/");
}

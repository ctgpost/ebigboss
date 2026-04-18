import { z } from "zod";
import { toast } from "sonner";

// Common Bengali validation messages
export const bengaliMessages = {
  required: (field: string) => `${field} অবশ্যই দিতে হবে`,
  minLength: (field: string, min: number) => `${field} কমপক্ষে ${min} অক্ষরের হতে হবে`,
  maxLength: (field: string, max: number) => `${field} সর্বোচ্চ ${max} অক্ষরের হতে পারবে`,
  invalidEmail: "সঠিক ইমেইল ঠিকানা দিন",
  invalidPhone: "সঠিক মোবাইল নম্বর দিন (১১ ডিজিট, 01 দিয়ে শুরু)",
  positive: (field: string) => `${field} অবশ্যই ০ এর বেশি হতে হবে`,
  nonNegative: (field: string) => `${field} ঋণাত্মক হতে পারবে না`,
};

// Phone: 11 digits, starts with 01
const phoneRegex = /^01[3-9]\d{8}$/;

export const productSchema = z.object({
  name: z.string().trim().min(1, bengaliMessages.required("প্রোডাক্টের নাম")).max(200, bengaliMessages.maxLength("নাম", 200)),
  category_id: z.string().trim().min(1, "ক্যাটাগরি সিলেক্ট করুন"),
  imei: z.string().trim().regex(/^\d{15}$/, "IMEI অবশ্যই ১৫ ডিজিটের হতে হবে"),
  condition: z.enum(["new", "used"], { errorMap: () => ({ message: "নতুন অথবা পুরাতন মোবাইল সিলেক্ট করুন" }) }),
  price: z.coerce.number({ invalid_type_error: "সঠিক মূল্য দিন" }).positive(bengaliMessages.positive("বিক্রয় মূল্য")),
  cost: z.coerce.number({ invalid_type_error: "সঠিক মূল্য দিন" }).nonnegative(bengaliMessages.nonNegative("ক্রয় মূল্য")),
});

export const customerSchema = z.object({
  name: z.string().trim().min(2, bengaliMessages.minLength("নাম", 2)).max(100, bengaliMessages.maxLength("নাম", 100)),
  email: z.string().trim().email(bengaliMessages.invalidEmail).max(255).optional().or(z.literal("")),
  phone: z.string().trim().regex(phoneRegex, bengaliMessages.invalidPhone).optional().or(z.literal("")),
  address: z.string().trim().max(500, bengaliMessages.maxLength("ঠিকানা", 500)).optional().or(z.literal("")),
  notes: z.string().trim().max(1000, bengaliMessages.maxLength("নোট", 1000)).optional().or(z.literal("")),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(2, bengaliMessages.minLength("সাপ্লায়ারের নাম", 2)).max(100),
  email: z.string().trim().email(bengaliMessages.invalidEmail).optional().or(z.literal("")),
  phone: z.string().trim().regex(phoneRegex, bengaliMessages.invalidPhone).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2, bengaliMessages.minLength("ক্যাটাগরির নাম", 2)).max(50, bengaliMessages.maxLength("নাম", 50)),
  description: z.string().trim().max(200, bengaliMessages.maxLength("বিবরণ", 200)).optional().or(z.literal("")),
});

export const paymentSchema = z.object({
  amount: z.coerce.number({ invalid_type_error: "সঠিক টাকার পরিমাণ দিন" }).positive("পরিমাণ ০ এর বেশি হতে হবে"),
  payment_method: z.string().min(1, "পেমেন্ট পদ্ধতি সিলেক্ট করুন"),
});

export const shopSettingsSchema = z.object({
  shop_name: z.string().trim().min(2, bengaliMessages.minLength("দোকানের নাম", 2)).max(100, bengaliMessages.maxLength("নাম", 100)),
  shop_subtitle: z.string().trim().max(200, bengaliMessages.maxLength("সাবটাইটেল", 200)).optional().or(z.literal("")),
  shop_phone: z.string().trim().regex(phoneRegex, bengaliMessages.invalidPhone).optional().or(z.literal("")),
  shop_address: z.string().trim().max(500, bengaliMessages.maxLength("ঠিকানা", 500)).optional().or(z.literal("")),
});

// POS-specific schemas
export const cartItemPriceSchema = z.coerce
  .number({ invalid_type_error: "সঠিক মূল্য দিন" })
  .positive("কাস্টম প্রাইস ০ এর বেশি হতে হবে");

export const instantCustomerSchema = z.object({
  instant_customer_name: z.string().trim().min(2, bengaliMessages.minLength("কাস্টমারের নাম", 2)).max(100),
  instant_customer_phone: z.string().trim().regex(phoneRegex, bengaliMessages.invalidPhone),
});

/**
 * Validate data with a Zod schema. Shows toast on first error.
 * Returns parsed data on success, null on failure.
 */
export function validateWithToast<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): z.infer<T> | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstError = result.error.errors[0];
    toast.error(firstError.message);
    return null;
  }
  return result.data;
}

/**
 * Validate data with a Zod schema. Returns errors as a field->message map for inline display.
 * Returns { success: true, data } or { success: false, errors }.
 */
export function validateInline<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
):
  | { success: true; data: z.infer<T>; errors: Record<string, string> }
  | { success: false; data: null; errors: Record<string, string> } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data, errors: {} };
  }
  const errors: Record<string, string> = {};
  for (const issue of result.error.errors) {
    const key = issue.path.join(".") || "_root";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { success: false, data: null, errors };
}

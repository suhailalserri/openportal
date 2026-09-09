export interface ApiResponse<T = unknown> {
  data?:    T;
  error?:   string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items:   T[];
  total:   number;
  page:    number;
  perPage: number;
  hasMore: boolean;
}

export type Locale = "ar" | "en";
export type Direction = "rtl" | "ltr";

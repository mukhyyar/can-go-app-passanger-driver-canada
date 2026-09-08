import { api } from './api';

export type CmsPage = {
  id?: string;
  slug: string;
  title: string;
  bodyMd: string;
  kind?: string;
  category?: string | null;
  sortOrder?: number;
  published?: boolean;
  updatedAt?: string;
};

export async function fetchCmsPage(slug: string): Promise<CmsPage> {
  return api<CmsPage>(`/cms/pages/${slug}`);
}

export async function fetchCmsPages(kind?: string): Promise<CmsPage[]> {
  const q = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  return api<CmsPage[]>(`/cms/pages${q}`);
}

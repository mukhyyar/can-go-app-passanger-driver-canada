'use client';

import { useParams } from 'next/navigation';
import { CmsPageView } from '../../../components/cms-page-view';

export default function Page() {
  const { slug } = useParams<{ slug: string }>();
  const id = typeof slug === 'string' ? slug : '';
  return (
    <CmsPageView
      slug={id}
      kicker="Blog"
      fallbackTitle="Article"
      fallbackBody="This article is not published yet. Check back shortly, or open the blog index."
    />
  );
}

'use client';

import { useParams } from 'next/navigation';
import { KycReviewWorkspace } from '../../../../components/kyc/review';

export default function KycDetail() {
  const { id } = useParams<{ id: string }>();
  return <KycReviewWorkspace driverId={id} />;
}

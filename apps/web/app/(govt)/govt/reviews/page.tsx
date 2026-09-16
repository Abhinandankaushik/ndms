import type { Metadata } from 'next';
import { ReviewsView } from '@/components/govt/reviews/ReviewsView';

export const metadata: Metadata = {
  title: 'Reviews',
};

export default function GovtReviewsPage() {
  return <ReviewsView />;
}

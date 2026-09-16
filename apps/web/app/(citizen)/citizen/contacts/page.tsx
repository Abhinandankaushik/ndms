import type { Metadata } from 'next';
import { HelplineList } from '@/components/citizen/contacts/HelplineList';

export const metadata: Metadata = {
  title: 'Emergency helplines',
};

export default function ContactsPage() {
  return <HelplineList />;
}

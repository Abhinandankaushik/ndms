'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, HandHelping, LayoutDashboard, Megaphone, Truck, Warehouse } from 'lucide-react';
import { SideNav, type NavItem } from '@/components/shell/PortalNav';
import { summaryQuery } from './queries';

export function GovtSideNav() {
  const { data: summary } = useQuery(summaryQuery());
  const pendingReviews = summary?.pendingReviews ?? 0;

  const items: NavItem[] = [
    { href: '/govt', label: 'Overview', icon: <LayoutDashboard />, exact: true },
    { href: '/govt/reviews', label: pendingReviews > 0 ? `Reviews (${pendingReviews})` : 'Reviews', icon: <ClipboardCheck /> },
    { href: '/govt/missions', label: 'Missions & teams', icon: <Truck /> },
    { href: '/govt/alerts', label: 'Alerts', icon: <Megaphone /> },
    { href: '/govt/volunteers', label: 'Volunteers', icon: <HandHelping /> },
    { href: '/govt/resources', label: 'Resources', icon: <Warehouse /> },
  ];

  return <SideNav items={items} />;
}

'use client';

import { FacilityDetailsForm } from './FacilityDetailsForm';
import { FacilityScreen } from './FacilityScreen';
import { OperationalStatusCard } from './OperationalStatusCard';

export function FacilityDetailsScreen() {
  return (
    <FacilityScreen title="Facility details">
      {(facility) => (
        <>
          <OperationalStatusCard facility={facility} />
          <FacilityDetailsForm facility={facility} />
        </>
      )}
    </FacilityScreen>
  );
}

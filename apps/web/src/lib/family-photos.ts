/** AI-generated photographs of fictional families, not member profile photos. */
const photo=(name:string,alt:string)=>({src:`/photos/demo/${name}-640.webp`,wide:`/photos/demo/${name}.webp`,alt});
export const familyPhotos={
  planning:photo('family-planning','Parents, children and a grandmother planning their week together at a kitchen table'),
  christmas:photo('christmas-morning','Children opening Christmas presents with their parents and grandmother beside a decorated tree'),
  thanksgiving:photo('thanksgiving-dinner','A multigenerational family sharing Thanksgiving dinner at home'),
  birthday:photo('backyard-birthday','A child blowing out birthday candles at a backyard family celebration'),
  roadTrip:photo('family-road-trip','Parents and children enjoying a mountain overlook on a national-park road trip'),
  beach:photo('coastal-vacation','A family walking barefoot along the water on an East Coast beach vacation'),
} as const;
export type FamilyPhoto=keyof typeof familyPhotos;

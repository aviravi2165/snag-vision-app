export const MOCK_STRUCTURE = [
  {
    FloorId: 'floor-1',
    FloorName: 'Ground Floor',
    FloorPlanImageUrl: 'https://placehold.co/900x600/16181d/ffffff.png?text=Floor+Plan',
    rooms: [
      {
        RoomId: 'room-1',
        RoomName: 'Lobby',
        ColorHex: '#D92906',
        PlanX: 0.3,
        PlanY: 0.4,
        spots: [
          { SpotId: 'spot-1', SpotName: 'Spot 1', RoomId: 'room-1', CoordinateX: 0.25, CoordinateY: 0.3, SortOrder: 1 },
          { SpotId: 'spot-2', SpotName: 'Spot 2', RoomId: 'room-1', CoordinateX: 0.5, CoordinateY: 0.45, SortOrder: 2 },
          { SpotId: 'spot-3', SpotName: 'Spot 3', RoomId: 'room-1', CoordinateX: 0.7, CoordinateY: 0.6, SortOrder: 3 },
        ],
      },
    ],
  },
];
import { ImmutableObject } from 'seamless-immutable'

export interface Config {
  useMapWidgetIds: string[];
  defaultDriveTimes?: {
    marker1: number;
    marker2: number;
    marker3: number;
  };
  polygonColors?: {
    marker1: number[];
    marker2: number[];
    marker3: number[];
  };
  widgetTitle?: string;
  maxDriveTime?: number;
}

export type IMConfig = ImmutableObject<Config>
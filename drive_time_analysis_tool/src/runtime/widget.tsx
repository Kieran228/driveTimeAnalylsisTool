/** @jsx jsx */
//#region Imports
import { AllWidgetProps, css, jsx, React } from 'jimu-core';
import { JimuMapView, JimuMapViewComponent } from 'jimu-arcgis';
import { Button, NumericInput } from 'jimu-ui';
import { IMConfig } from '../config';

// ArcGIS imports
import Graphic from '@arcgis/core/Graphic';
import OAuthInfo from '@arcgis/core/identity/OAuthInfo';
import esriId from '@arcgis/core/identity/IdentityManager';
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol';
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol';
import Polygon from '@arcgis/core/geometry/Polygon';
//#endregion

//#region Interfaces

interface DriveTimeState {
  mapView?: JimuMapView;
  selectedTimes: { [key: number]: number };
  isProcessing: { [key: number]: boolean };
  errors: { [key: string]: string };
  clickedPoints: { [key: number]: __esri.Point };
  currentMarker: number;
}

//#endregion

//#region Widget Class
export default class DriveTimeWidget extends React.PureComponent<AllWidgetProps<IMConfig>, DriveTimeState> {
  private clickHandler: any;

  //#region Lifecycle Methods
  constructor(props: AllWidgetProps<IMConfig>) {
    super(props);
    
    // Initialize state using config values
    this.state = {
      selectedTimes: {
        1: props.config?.defaultDriveTimes?.marker1 ?? 5,
        2: props.config?.defaultDriveTimes?.marker2 ?? 10,
        3: props.config?.defaultDriveTimes?.marker3 ?? 15
      },
      isProcessing: {},
      errors: {},
      clickedPoints: {},
      currentMarker: 1
    };

    // Set up ArcGIS authentication
    const oauthInfo = new OAuthInfo({
      appId: "HLuJEmQiQcHQJ96x",
      portalUrl: "https://www.arcgis.com",
      popup: false
    });
    esriId.registerOAuthInfos([oauthInfo]);
  }
  //#endregion

  //#region Map Event Handlers

  // Sets up the map when it's ready
  activeViewChangeHandler = (jmv: JimuMapView) => {
    if (jmv) {
      this.setState({ mapView: jmv }, () => {
        if (this.clickHandler) {
          this.clickHandler.remove();
        }
        this.clickHandler = jmv.view.on('click', this.handleMapClick);
      });
    }
  };

  // Handles map clicks
  //#endregion

  //#region Event Handlers
  handleMapClick = (event: any) => {
    if (event.mapPoint && this.state.currentMarker <= 3) {
      this.setState(prevState => ({
        clickedPoints: {
          ...prevState.clickedPoints,
          [prevState.currentMarker]: event.mapPoint
        },
        currentMarker: prevState.currentMarker + 1,
        errors: {}
      }), () => {
        this.addPointMarker(event.mapPoint, this.state.currentMarker - 1);
      });
    }
  };

  //#endregion

  //#region Utility Methods
  // Gets color for marker from config or defaults
  private getMarkerColor = (markerNumber: number): number[] => {
    const defaultColors = {
      1: [51, 51, 204],  // Blue
      2: [204, 51, 51],  // Red
      3: [51, 204, 51]   // Green
    };

    return this.props.config?.polygonColors?.[`marker${markerNumber}`] ?? defaultColors[markerNumber];
  };

  //#endregion

  //#region Map Operations
  // Adds a marker to the map
  addPointMarker = (point: __esri.Point, markerNumber: number): void => {
    if (this.state.mapView?.view) {
      const color = this.getMarkerColor(markerNumber);

      const marker = new Graphic({
        geometry: point,
        symbol: new SimpleMarkerSymbol({
          style: "circle",
          color: color,
          outline: { color: [255, 255, 255], width: 2 },
          size: 12
        })
      });

      this.state.mapView.view.graphics.add(marker);
    }
  };

  // Generates drive time area polygon
  generateDriveTimeArea = async (markerNumber: number) => {
    const { mapView } = this.state;
    if (!mapView?.view) return;

    try {
      this.setState(prev => ({
        isProcessing: { ...prev.isProcessing, [markerNumber]: true }
      }));

      const credential = await esriId.getCredential("https://www.arcgis.com/sharing/rest");
      const point = this.state.clickedPoints[markerNumber];
      const driveTime = this.state.selectedTimes[markerNumber];
      
      const params = new URLSearchParams({
        f: "json",
        facilities: JSON.stringify({
          features: [{
            geometry: {
              x: point.x,
              y: point.y,
              spatialReference: mapView.view.spatialReference
            }
          }]
        }),
        defaultBreaks: [driveTime].toString(),
        returnPolygons: "true",
        outSR: mapView.view.spatialReference.wkid.toString(),
        token: credential.token
      });

      const response = await fetch(
        "https://route-api.arcgis.com/arcgis/rest/services/World/ServiceAreas/NAServer/ServiceArea_World/solveServiceArea?" + 
        params.toString()
      );

      if (!response.ok) throw new Error('Network response was not ok');

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      if (data.saPolygons?.features?.[0]) {
        const polygon = data.saPolygons.features[0].geometry;
        const color = this.getMarkerColor(markerNumber);

        const graphic = new Graphic({
          geometry: new Polygon({
            rings: polygon.rings,
            spatialReference: mapView.view.spatialReference
          }),
          symbol: new SimpleFillSymbol({
            style: "solid",
            color: [...color, 0.25],
            outline: {
              color: color,
              width: 2
            }
          })
        });

        mapView.view.graphics.add(graphic);
      }

    } catch (error) {
      this.setState(prev => ({
        errors: { 
          ...prev.errors, 
          [markerNumber]: error.message 
        }
      }));
    } finally {
      this.setState(prev => ({
        isProcessing: { 
          ...prev.isProcessing, 
          [markerNumber]: false 
        }
      }));
    }
  };

  // Handles drive time input changes
  //#endregion

  //#region UI Event Handlers
  handleTimeChange = (value: number, markerNumber: number): void => {
    const maxTime = this.props.config?.maxDriveTime ?? 15;
    const boundedValue = Math.min(Math.max(value, 1), maxTime);
    this.setState(prev => ({
      selectedTimes: {
        ...prev.selectedTimes,
        [markerNumber]: boundedValue
      }
    }));
  };

  //#endregion

  render(): React.ReactNode {
    const { useMapWidgetIds, config } = this.props;
    const { clickedPoints, isProcessing, errors, selectedTimes } = this.state;

    return (
      <div css={css`
        padding: 16px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
        
        .widget-title {
          font-size: 1.4em;
          font-weight: 600;
          color: #1a1a1a;
          padding: 12px;
          margin-bottom: 16px;
          background: linear-gradient(to right, #f8f9fa, #e9ecef);
          border-radius: 6px;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        
        .controls {
          margin-top: 16px;
        }
        
        .instructions {
          padding: 12px;
          background: #f8f9fa;
          border-left: 4px solid #0a58ca;
          border-radius: 4px;
          margin-bottom: 16px;
          text-align: center;
          font-size: 0.95em;
          color: #444;
        }
        
        .marker-controls {
          border: 1px solid #e9ecef;
          padding: 16px;
          margin-bottom: 16px;
          border-radius: 8px;
          background: white;
          transition: all 0.2s ease;
          
          &:hover {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
            transform: translateY(-1px);
          }
          
          h3 {
            font-size: 1.1em;
            margin-bottom: 12px;
            color: #2c3e50;
            display: flex;
            align-items: center;
            gap: 8px;
          }
        }
        
        .time-input {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
          
          .jimu-input {
            max-width: 120px;
            
            input {
              border-radius: 4px;
              border: 1px solid #dee2e6;
              padding: 8px;
              
              &:focus {
                border-color: #0a58ca;
                box-shadow: 0 0 0 2px rgba(10, 88, 202, 0.1);
              }
            }
          }
          
          span {
            color: #6c757d;
            font-size: 0.9em;
          }
        }
        
        .jimu-btn {
          background-color: #0a58ca;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          transition: all 0.2s ease;
          
          &:hover:not(:disabled) {
            background-color: #0b5ed7;
            transform: translateY(-1px);
          }
          
          &:disabled {
            background-color: #e9ecef;
            color: #6c757d;
          }
        }
        
        .error {
          color: #dc3545;
          font-size: 0.9em;
          margin-top: 8px;
          padding: 8px;
          background: #fff5f5;
          border-radius: 4px;
          display: flex;
          align-items: center;
          gap: 6px;
          
          &:before {
            content: "⚠️";
          }
        }
      `}>
        {config?.widgetTitle && (
          <div className="widget-title">
            {config.widgetTitle}
          </div>
        )}

        {useMapWidgetIds?.length > 0 ? (
          <JimuMapViewComponent
            useMapWidgetId={useMapWidgetIds[0]}
            onActiveViewChange={this.activeViewChangeHandler}
          />
        ) : (
          <div className="error">Please configure a map widget</div>
        )}

        <div className="controls">
          <div className="instructions">
            Click on the map to place up to 3 markers for drive time analysis
          </div>

          {[1, 2, 3].map(markerNum => {
            const color = this.getMarkerColor(markerNum);
            return (
              <div 
                key={markerNum} 
                className="marker-controls" 
                style={{ 
                  borderColor: `rgba(${color.join(',')}, 0.3)`,
                  borderLeft: `4px solid rgb(${color.join(',')})` 
                }}
              >
                <h3>
                  Marker {markerNum}
                  {clickedPoints[markerNum] ? 
                    <span style={{color: 'green'}}>✓</span> : 
                    <span style={{color: '#6c757d'}}>(click map)</span>
                  }
                </h3>

                <div className="time-input">
                  <NumericInput
                    min={1}
                    max={config?.maxDriveTime ?? 15}
                    value={selectedTimes[markerNum]}
                    onChange={value => this.handleTimeChange(value, markerNum)}
                    disabled={!clickedPoints[markerNum]}
                  />
                  <span>minutes</span>
                </div>

                <Button
                  onClick={() => this.generateDriveTimeArea(markerNum)}
                  disabled={!clickedPoints[markerNum] || isProcessing[markerNum]}
                >
                  {isProcessing[markerNum] ? 
                    'Calculating...' : 
                    'Generate Drive Time Area'
                  }
                </Button>

                {errors[markerNum] && (
                  <div className="error">{errors[markerNum]}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}
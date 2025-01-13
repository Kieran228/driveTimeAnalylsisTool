//todo we need to get our "tools" (api components) ready for the project. lets grab the imports needed for the widget
/** @jsx jsx  */

//? These are the core Experience Builder imports
import { AllWidgetProps, css, jsx, React } from 'jimu-core';
import { JimuMapView, JimuMapViewComponent } from 'jimu-arcgis';
import { Button, NumericInput } from 'jimu-ui';
import { IMConfig } from '../config';

//? These are ArcGIS Imports for Authentication
import oAuthInfo from '@arcgis/core/identity/OAuthInfo';
import esriId from '@arcgis/core/identity/IdentityManager'

//? These are ArcGIS Imports for mapping functionality
import Graphic from '@arcgis/core/Graphic';
import Polygon from 'esri/geometry/Polygon';
import SimpleMarkerSymbol from 'esri/symbols/SimpleMarkerSymbol';
import SimpleFillSymbol from 'esri/symbols/SimpleFillSymbol';


//todo Now it's time to define our interface for the widget.

// interface DriveTimeState {
//     mapView?: JimuMapView, 
//     selectedTimes: { [key: number]: number }; //? times for each polygon - index sig
//     isProcessing?: boolean;
//     errors: { [key: string]: string }; //? also uses index signature - allows us to define error messages with an error object that allows any amount of keys. The keys must be strings and the values must be strings as well.

//     clickedPoint?: __esri.Point,
//     completedPolygons: { [key: number]: boolean }; //? tracks polygon completion - another index signature with number keys and boolean values
// };

interface DriveTimeState {
    isProcessing?: boolean,
    mapView?: JimuMapView,
    clickedPoint?: __esri.Point,
    selectedTimes: { [key: number]: number };
    completedPolygons: { [key: number]: boolean };
    errors: { [key: string]: string };
}

//todo Now we need to begin our widget class...
export default class DriveTimeWidget extends React.PureComponent<AllWidgetProps<IMConfig>, DriveTimeState> {
    private clickHandler: any; //? holds our map click handler - makes it private to the DriveTimeWidget class, not accessible anywhere else within the program

    constructor(props: AllWidgetProps<IMConfig>) { //? initializes default state with config
        super(props);

        this.state = {
            selectedTimes: {
                1: props.config?.defaultDriveTimes?.marker1 ?? 5, //? grab marker 1 from config and if there is an error with the path, use 5 as default
                2: props.config?.defaultDriveTimes?.marker2 ?? 10,
                3: props.config?.defaultDriveTimes?.marker3 ?? 15
            },
            isProcessing: false,
            errors: {},
            completedPolygons: {}
        };

        //todo time to set up Authentication...
        const oauthinfo = new oAuthInfo({
            appId: "HLuJEmQiQcHQJ96x",
            portalUrl: "https://arcgis.com",
            popup: false,
        });
        esriId.registerOAuthInfos([oauthinfo]);
    }

    //todo Now it's time to set up our mapview method. This defines the type of mapview we want to use and we use setState to access our widget's properties, state, methods and props.
    activeViewChangeHandler = (jmv: JimuMapView) => {
        if (jmv) {
            this.setState({ mapView: jmv }, () => {
                if (this.clickHandler) {
                    this.clickHandler.remove();
                }
                this.clickHandler = jmv.view.on('click', this.handleMapClick); //? clicks map, calls handleMapClick method. It passes the click event to
                //? handleMapClick. The event contains mapPoint, tells us where user clicked
            });
        }
    };

    //todo Now its time to define the map click method, our second method: This will run every time the user clicks the map
    handleMapClick = (event: any) => {
        if (event.mapPoint) {
            if (this.state.mapView?.view) {
                this.state.mapView.view.graphics.removeAll;
            }

            //? update the state with a new point and reset the status
            this.setState({
                clickedPoint: event.mapPoint, //? stores clicked location, updates new point
                errors: {},                   //? resets errors
                completedPolygons: {},        //? resets completion status
            }, () => {                        //? we use another callback function to wait for the state to update, then add the marker to map
                this.addPointMarker(event.mapPoint);
            })
        }
    };

    //todo Lets add our 3rd method, which is the addPointMarker method; which creates a visable marker on the map
    addPointMarker = (point: __esri.Point): void => {                 //? takes point param type of __esri.Point (arcgis point type) - arrow func to
        //? to maintain this context (drivetimewidget class) 
        if (this.state.mapView?.view) {
            const marker = new Graphic({                              //? create a new marker graphic
                geometry: point,                                      //? where to place the marker
                symbol: new SimpleMarkerSymbol({
                    style: "diamond",
                    color: this.getMarkerColor(1),                    //? use first color scheme
                    outline: { color: [255, 255, 255], width: 2 },    //? white outline
                    size: 12                                          //? 12px diameter
                })
            });
            this.state.mapView.view.graphics.add(marker);             //? adds marker to map
        }
    };

    //todo Now that we've created a graphic for the user's clicked point and added it to the map, we need to configure the marker graphic's color
    //todo lets create our utility method
    //! MAKE SURE TO PUT THIS UTIL METHOD BACK ABOVE addPointMarker IF THERE IS ISSUES
    private getMarkerColor = (markerNumber: number): number[] => {
        const defaultColors = { //? this object is called as a default if the polygon colors' arent found
            1: [51, 51, 204],
            2: [204, 51, 51],
            3: [51, 204, 51]
        };
        return this.props.config?.polygonColors?.[`marker${markerNumber}`] ?? defaultColors[markerNumber]; //? props are passed from the ExB, then
        //? tries to grab the config object
        //? if config exist, try to get polygon
        //? colors
    };

    generateDriveTimeAreas = async () => {                                           //? we use asynq arrow function because it makes api calls. async
        //? can use await to handle promises
        const { mapView, selectedTimes, clickedPoint } = this.state;                 //? next we destructure what we need from the state
        if (!mapView?.view || !clickedPoint) return;                                 //? safety check to make sure we have the required data

        try {                                                                        //? start of our error handling block, will catch any errors during
            //? execution
            this.setState({ isProcessing: true });                                    //? updates state to indicate that we're processing the drive times
            //? used to show loading indicators in UI

            const credential = await esriId.getCredential("https://arcgis.com/sharing/rest"); //? await waits for credentials before continuing


            for (let markerNumber = 1; markerNumber <= 3; markerNumber++) {                   //? marker number will either be 1, 2, or 3
                const driveTime = selectedTimes[markerNumber];                                //? number correlates with selectedTimes state and passes
                //? in the index # 1 - 3 

                const params = new URLSearchParams({
                    f: "json",                                                                //? return data in json format, data that will work in JS
                    facilities: JSON.stringify({                                              //? converts our JS object into a string
                        features: [{
                            geometry: {
                                x: clickedPoint.x,                                            //? contains the x and y coords of where user clicked
                                y: clickedPoint.y,
                                SpatialReference: mapView.view.spatialReference                   //? tells API what coordinate system we're using
                            }
                        }]
                    }),
                    defaultBreaks: [driveTime].toString(),                                    //? drive time put into array and converted into string
                    returnPolygons: "true",                                                   //? tells API how far to drive and we want polygons back
                    outSR: mapView.view.spatialReference.wkid.toString(),                     //? specifies what coord system we want results in
                    //? matches coord system map uses
                    token: credential.token                                                   //? auth token - proves we can use services
                });

                //todo Now its time to combine all these parameters to make a URL string we use to make the api request
                const response = await fetch(
                    "https://route-api.arcgis.com/arcgis/rest/services/World/ServiceAreas/NAServer/ServiceArea_World/solveServiceArea?" + params.toString()
                );

                if (!response.ok) throw new Error('Network response was not ok');              //? throw will create a new error and stop the flow of
                //? code


                const data = await response.json();                                            //? converts the API response from raw JSON text into
                //? a JS object. wait for this conversion before moving on
                if (data.error) throw new Error(data.error.message);                           //? checks if api returned an error - applies that error
                //? message

                if (data.saPolygons?.features?.[0]) {                                          //? checks to see if we got any polygon data back
                    const polygon = data.saPolygons.features[0].geometry;                      //? if we make it here we have valid polygon data
                    const color = this.getMarkerColor(markerNumber);                           //? we're getting the color from the utility method

                    const graphic = new Graphic({                                              //? creates a new visual element
                        geometry: new Polygon({                                                //? we're now combining shape and style into a graphic
                            //? geometry: polygonShape | symbol: polygonStyle
                            rings: polygon.rings,
                            spatialReference: mapView.view.spatialReference                    //? how to interprate coords
                        }),
                        symbol: new SimpleFillSymbol({
                            style: "solid",
                            color: [...color, 0.25],                                           //? adds the same color from method (number) and adds
                            //? opacity with spread operator
                            outline: {
                                color: color,
                                width: 2
                            }
                        })
                    });

                    mapView.view.graphics.add(graphic);                                        //? adds newly created graphics polygon to the graphics
                    //? layer

                    this.setState(prev => ({                                                   //? updating state. prev gives us access to the previous
                        //? state. then we spread them out in current conditions
                        //? then update the completedPolygons object
                        completedPolygons: {
                            ...prev.completedPolygons,
                            [markerNumber]: true
                        }
                    }));
                }
            }
        } catch (error) {                                                                      //? if try does not work, updates state of errors
            //? general error mssg becomes api's error message
            this.setState({
                errors: { general: error.message }
            });
        } finally {                                                                            //? finally will run reguardless of both. cleanup.
            //? resets state of isProcessing to false
            this.setState({ isProcessing: false });
        }
    };

    handleDriveTimeChange = (value: number, markerNumber: number): void => {                   //? takes in the new time entered by user and which
        //? time slot we're affecting (1, 2, or 3)
        const maxTime = this.props.config?.maxDriveTime ?? 15;
        const boundedValue = Math.min(Math.max(value, 1), maxTime);
        this.setState(prev => ({
            selectedTimes: {
                ...prev.selectedTimes,
                [markerNumber]: boundedValue
            }
        }));
    };

    render(): React.ReactNode {

        const { useMapWidgetIds, config } = this.props;
        const { clickedPoint, isProcessing, errors, selectedTimes, completedPolygons } = this.state;

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
                
                .time-controls {
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
                }
                
                .time-input {
                    display: flex;
                    align-items: center;
                    gap: 6px;
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
                    width: 100%;
                    margin-top: 16px;
                    
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
                    <div className="error">Please Configure A Map Widget</div>
                )}

                <div className="controls">
                    <div className="instructions">
                        Click on the map to place the marker, then configure drive times and generate service areas
                    </div>

                    <div className="time-controls">
                        {[1, 2, 3].map(markerNum => {
                            const color = this.getMarkerColor(markerNum);
                            return (
                                <div
                                    key={markerNum}
                                    className="time-input"
                                    style={{
                                        borderLeft: `4px solid rgb(${color.join(',')})`,
                                        paddingLeft: '6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}
                                >
                                    <NumericInput
                                        min={1}
                                        max={config?.maxDriveTime ?? 15}
                                        value={selectedTimes[markerNum]}
                                        onChange={value => this.handleDriveTimeChange(value, markerNum)}
                                    />
                                    <span>minutes</span>
                                    {completedPolygons[markerNum] && (
                                        <span style={{
                                            color: 'green',
                                            marginLeft: '8px',
                                            fontSize: '1.2em',
                                            display: 'flex',
                                            alignItems: 'center'
                                        }}>
                                            ✓
                                        </span>
                                    )}
                                </div>
                            );
                        })}

                        <Button
                            onClick={this.generateDriveTimeAreas}
                            disabled={!clickedPoint || isProcessing}
                        >
                            {isProcessing ?
                                'Calculating Drive Time Areas' :
                                'Generate Drive Time Areas'
                            }
                        </Button>

                        {errors.general && (
                            <div className="error"> {errors.general} </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }
}


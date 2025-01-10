/** @jsx jsx */ 
//* This special comment enables JSX processing with the jsx function instead of React.createElement

//* Import necessary dependencies from Experience Builder's core functionality
import { React, jsx, css } from "jimu-core";  //* Core utilities for React, JSX processing, and CSS-in-JS
import { AllWidgetSettingProps } from "jimu-for-builder";  //* Type definition for widget settings props
import { IMConfig } from "../config";  //* Import our widget's configuration interface

// Import UI components from Experience Builder's component libraries
import { 
    MapWidgetSelector,  // Allows users to select which map widget to connect to
    SettingRow,         // Provides consistent row layout for settings
    SettingSection      // Groups related settings together
} from "jimu-ui/advanced/setting-components";
import { TextInput, NumericInput, Label } from "jimu-ui";  // Basic input components
import { ColorPicker } from 'jimu-ui/basic/color-picker';  // Color selection component

// Define the state interface for our settings component (currently empty as we're using props for everything)
interface SettingState {}

// Main Settings component class
export default class Setting extends React.PureComponent<AllWidgetSettingProps<IMConfig>, SettingState> {
    // Initialize the component with props
    constructor(props: AllWidgetSettingProps<IMConfig>) {
        super(props);
    }

    // Handler for map widget selection
    // Called when user selects a map widget to connect to
    onMapSelected = (useMapWidgetIds: string[]) => {
        this.props.onSettingChange({
            id: this.props.id,
            useMapWidgetIds: useMapWidgetIds  // Update the selected map widget IDs
        });
    };

    // Handler for widget title changes
    // Called when user modifies the widget title
    onTitleChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
        this.props.onSettingChange({
            id: this.props.id,
            config: {
                ...this.props.config,  // Preserve existing configuration
                widgetTitle: evt.target.value  // Update only the title
            }
        });
    };

    // Handler for drive time value changes
    // Called when user adjusts the drive time for any marker
    onDefaultDriveTimeChange = (value: number, markerNum: number) => {
        // Get maximum allowed time from config, default to 15 if not set
        const maxTime = this.props.config?.maxDriveTime ?? 15;
        // Ensure value stays within valid range (1 to maxTime)
        const boundedValue = Math.min(Math.max(value, 1), maxTime);
        
        // Update the configuration with new drive time
        this.props.onSettingChange({
            id: this.props.id,
            config: {
                ...this.props.config,
                defaultDriveTimes: {
                    ...this.props.config?.defaultDriveTimes,  // Preserve other markers' times
                    [`marker${markerNum}`]: boundedValue      // Update specific marker's time
                }
            }
        });
    };

    // Utility function to convert RGB values to hex color string
    rgbToHex = (r: number, g: number, b: number): string => {
        // Helper function to convert a single number to two-digit hex
        const toHex = (n: number) => {
            const hex = n.toString(16);
            return hex.length === 1 ? "0" + hex : hex;  // Pad single digits with leading zero
        };
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;  // Combine into hex color code
    };

    // Handler for color changes
    // Called when user selects a new color from the color picker
    onColorChange = (color: string, markerNum: number) => {
        // Convert hex color string to RGB values
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);  // Red component
        const g = parseInt(hex.substring(2, 4), 16);  // Green component
        const b = parseInt(hex.substring(4, 6), 16);  // Blue component

        // Update configuration with new color
        this.props.onSettingChange({
            id: this.props.id,
            config: {
                ...this.props.config,
                polygonColors: {
                    ...this.props.config?.polygonColors,     // Preserve other colors
                    [`marker${markerNum}`]: [r, g, b]       // Update specific marker's color
                }
            }
        });
    };

    // Render the settings UI
    render() {
        return (
            // Main container with CSS styling
            <div css={css`
                .setting-row {
                    margin-bottom: 10px;
                }
                .color-picker-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-top: 8px;
                }
            `}>
                {/* Map Widget Selection Section */}
                <SettingSection className="map-selector-section" title="Map Widget">
                    <SettingRow>
                        <MapWidgetSelector 
                            onSelect={this.onMapSelected}
                            useMapWidgetIds={this.props.useMapWidgetIds}
                        />
                    </SettingRow>
                </SettingSection>

                {/* Widget Configuration Section */}
                <SettingSection title="Widget Settings">
                    {/* Widget Title Input */}
                    <SettingRow>
                        <div className="w-100">
                            <Label>Widget Title</Label>
                            <TextInput 
                                value={this.props.config?.widgetTitle || ""}
                                onChange={this.onTitleChange}
                                className="w-100"
                            />
                        </div>
                    </SettingRow>

                    {/* Marker Settings - Generate settings UI for each marker */}
                    {[1, 2, 3].map(markerNum => {
                        // Define default colors for each marker
                        const defaultColor = markerNum === 1 ? [51, 51, 204] :  // Blue
                                          markerNum === 2 ? [204, 51, 51] :     // Red
                                          [51, 204, 51];                        // Green
                        
                        // Get current color from config or use default
                        const currentColor = this.props.config?.polygonColors?.[`marker${markerNum}`] ?? defaultColor;
                        
                        // Get current drive time from config or use default based on marker number
                        const currentDriveTime = this.props.config?.defaultDriveTimes?.[`marker${markerNum}`] ?? 
                                               (markerNum === 1 ? 5 : markerNum === 2 ? 10 : 15);

                        return (
                            <div key={markerNum} className="setting-row">
                                <SettingRow>
                                    <div className="w-100">
                                        {/* Marker Section Title */}
                                        <Label className="w-100 mb-2">{`Marker ${markerNum} Settings`}</Label>
                                        
                                        {/* Drive Time Input Section */}
                                        <div className="mb-3">
                                            <Label>Default Drive Time (1-15 minutes)</Label>
                                            <NumericInput
                                                value={currentDriveTime}
                                                min={1}
                                                max={this.props.config?.maxDriveTime ?? 15}
                                                onChange={value => this.onDefaultDriveTimeChange(value, markerNum)}
                                                className="w-100"
                                            />
                                        </div>
                                        
                                        {/* Color Picker Section */}
                                        <div className="color-picker-row">
                                            <Label>Polygon Color</Label>
                                            <ColorPicker
                                                color={this.rgbToHex(currentColor[0], currentColor[1], currentColor[2])}
                                                onChange={color => this.onColorChange(color, markerNum)}
                                            />
                                        </div>
                                    </div>
                                </SettingRow>
                            </div>
                        );
                    })}
                </SettingSection>
            </div>
        );
    }
}
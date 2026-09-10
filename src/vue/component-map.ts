import type { Component as VueComponent } from 'vue';
import type { ComponentType } from '../schema/flow-json';
import TextBlock from './components/text-block.vue';
import RichText from './components/rich-text.vue';
import ImageBlock from './components/image-block.vue';
import ImageCarousel from './components/image-carousel.vue';
import TextInput from './components/text-input.vue';
import TextArea from './components/text-area.vue';
import CheckboxGroup from './components/checkbox-group.vue';
import RadioButtonsGroup from './components/radio-buttons-group.vue';
import Dropdown from './components/dropdown.vue';
import ChipsSelector from './components/chips-selector.vue';
import OptIn from './components/opt-in.vue';
import DatePicker from './components/date-picker.vue';
import CalendarPicker from './components/calendar-picker.vue';
import FilePicker from './components/file-picker.vue';
import FooterButton from './components/footer-button.vue';
import EmbeddedLink from './components/embedded-link.vue';
import NavigationList from './components/navigation-list.vue';
import Unsupported from './components/unsupported.vue';

const MAP: Partial<Record<ComponentType, VueComponent>> = {
  TextHeading: TextBlock,
  TextSubheading: TextBlock,
  TextBody: TextBlock,
  TextCaption: TextBlock,
  RichText,
  Image: ImageBlock,
  ImageCarousel,
  TextInput,
  TextArea,
  CheckboxGroup,
  RadioButtonsGroup,
  Dropdown,
  ChipsSelector,
  OptIn,
  DatePicker,
  CalendarPicker,
  PhotoPicker: FilePicker,
  DocumentPicker: FilePicker,
  Footer: FooterButton,
  EmbeddedLink,
  NavigationList,
};

export function componentFor(type: ComponentType): VueComponent {
  return MAP[type] ?? Unsupported;
}

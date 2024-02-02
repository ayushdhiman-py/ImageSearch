import React, {useState} from 'react';
import {View, Button, Image} from 'react-native';
import ImagePicker from 'react-native-image-picker';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';

const VisionAPI = () => {
  const [imageUri, setImageUri] = useState();
  const [labels, setLabels] = useState();

  const pickImage = () => {
    const options = {
      noData: true,
    };
    ImagePicker.launchImageLibrary(options, response => {
      if (response.uri) {
        setImageUri(response.uri);
      }
    });
  };

  return (
    <View>
      <Button title="Pick an image" onPress={pickImage} />
      {imageUri && (
        <Image source={{uri: imageUri}} style={{width: 200, height: 200}} />
      )}
    </View>
  );
};

export default VisionAPI;

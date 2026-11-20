#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "CamCharacter.generated.h"

class UInputAction; class UInputMappingContext; class USpringArmComponent; class UCameraComponent; class AFootball; class UAnimSequence; class USoundBase;

// Cam: third-person, Enhanced Input (keyboard + Xbox pad), charged kicks with curl, auto-dribble, his voice lines.
UCLASS(Config=Game)
class NUNHEADGTA_API ACamCharacter : public ACharacter
{
	GENERATED_BODY()
public:
	ACamCharacter();
	UPROPERTY(VisibleAnywhere) USpringArmComponent* Boom;
	UPROPERTY(VisibleAnywhere) UCameraComponent* Camera;
	// assets by path (set in DefaultGame.ini after the Python import), all optional
	UPROPERTY(Config) FString CamMeshPath; UPROPERTY(Config) FString IdleAnimPath; UPROPERTY(Config) FString RunAnimPath; UPROPERTY(Config) FString JumpAnimPath; UPROPERTY(Config) FString ShutUpSoundPath;
	UPROPERTY(EditAnywhere, Category="Cam") float WalkSpeed = 420.f;
	UPROPERTY(EditAnywhere, Category="Cam") float SprintSpeed = 820.f;
	UPROPERTY(EditAnywhere, Category="Cam") float KickReach = 150.f;
	UPROPERTY(BlueprintReadOnly, Category="Cam") float KickCharge = 0.f;
	UPROPERTY(BlueprintReadOnly, Category="Cam") int32 Goals = 0;
	void OnGoal(bool bHomeScored);
protected:
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	void BuildInput();
	void Move(const struct FInputActionValue& V); void Look(const struct FInputActionValue& V);
	void SprintOn(); void SprintOff(); void KickStart(); void KickRelease(); void DoJump();
	AFootball* NearestBall(float MaxDist) const;
	void PlayClip(UAnimSequence* Clip, bool bLoop);
	UPROPERTY() UInputMappingContext* Mapping = nullptr;
	UPROPERTY() UInputAction* MoveAction = nullptr; UPROPERTY() UInputAction* LookAction = nullptr; UPROPERTY() UInputAction* JumpAction = nullptr; UPROPERTY() UInputAction* SprintAction = nullptr; UPROPERTY() UInputAction* KickAction = nullptr;
	UPROPERTY() UAnimSequence* IdleAnim = nullptr; UPROPERTY() UAnimSequence* RunAnim = nullptr; UPROPERTY() UAnimSequence* JumpAnim = nullptr; UPROPERTY() UAnimSequence* CurrentClip = nullptr;
	UPROPERTY() USoundBase* ShutUpSound = nullptr;
	FVector2D MoveInput = FVector2D::ZeroVector;
	bool bCharging = false; float DribbleCooldown = 0.f;
};
